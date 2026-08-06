//go:build windows

package main

import (
	"bytes"
	"crypto/sha256"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"syscall"
	"unsafe"

	"golang.org/x/sys/windows"
)

const (
	procThreadAttributeSecurityCapabilities = 0x00020009
	waitTimeout                             = 0x00000102
)

// SECURITY_CAPABILITIES is deliberately kept local because x/sys exposes the
// generic process-attribute APIs but not this AppContainer-specific payload.
// It must match the Windows SECURITY_CAPABILITIES layout exactly.
type appContainerSecurityCapabilities struct {
	AppContainerSid *windows.SID
	Capabilities    *windows.SIDAndAttributes
	CapabilityCount uint32
	Reserved        uint32
}

var (
	userenvDLL                        = syscall.NewLazyDLL("userenv.dll")
	createAppContainerProfileProc     = userenvDLL.NewProc("CreateAppContainerProfile")
	deriveAppContainerSidFromNameProc = userenvDLL.NewProc("DeriveAppContainerSidFromAppContainerName")
)

func defaultSandboxBackend() string {
	if appContainerAvailable() {
		return "appcontainer"
	}
	return "portable-copy"
}

// appContainerAvailable only reports API availability. Profile creation and
// process launch still return their concrete Windows error to the task.
func appContainerAvailable() bool {
	return createAppContainerProfileProc.Find() == nil && deriveAppContainerSidFromNameProc.Find() == nil
}

func runAppContainerCommand(workspace string, command string, timeoutSec int) (commandResult, error) {
	if !appContainerAvailable() {
		return commandResult{}, errors.New("Windows AppContainer APIs are unavailable")
	}
	if strings.TrimSpace(command) == "" {
		return commandResult{}, errors.New("command is required")
	}
	if timeoutSec <= 0 || timeoutSec > 120 {
		timeoutSec = 30
	}
	workspace, err := filepath.Abs(workspace)
	if err != nil {
		return commandResult{}, fmt.Errorf("resolve sandbox workspace: %w", err)
	}
	sid, err := appContainerSIDForWorkspace(workspace)
	if err != nil {
		return commandResult{}, err
	}
	defer windows.FreeSid(sid)
	if err := grantAppContainerWorkspaceAccess(workspace, sid); err != nil {
		return commandResult{}, err
	}
	return launchAppContainerCommand(workspace, command, timeoutSec, sid)
}

func appContainerSIDForWorkspace(workspace string) (*windows.SID, error) {
	sum := sha256.Sum256([]byte(strings.ToLower(filepath.Clean(workspace))))
	name := fmt.Sprintf("Veloce.CloudSandbox.%x", sum[:16])
	nameUTF16, err := windows.UTF16PtrFromString(name)
	if err != nil {
		return nil, err
	}
	displayUTF16, err := windows.UTF16PtrFromString("Veloce Cloud Sandbox")
	if err != nil {
		return nil, err
	}
	descriptionUTF16, err := windows.UTF16PtrFromString("Managed Veloce cloud sandbox worker")
	if err != nil {
		return nil, err
	}
	var sid *windows.SID
	status, _, _ := createAppContainerProfileProc.Call(
		uintptr(unsafe.Pointer(nameUTF16)),
		uintptr(unsafe.Pointer(displayUTF16)),
		uintptr(unsafe.Pointer(descriptionUTF16)),
		0,
		0,
		uintptr(unsafe.Pointer(&sid)),
	)
	if status == 0 && sid != nil {
		return sid, nil
	}
	// An existing profile makes CreateAppContainerProfile return an HRESULT.
	// Deriving the SID is the authoritative way to distinguish that normal
	// case from an actual profile creation failure.
	sid = nil
	status, _, _ = deriveAppContainerSidFromNameProc.Call(uintptr(unsafe.Pointer(nameUTF16)), uintptr(unsafe.Pointer(&sid)))
	if status != 0 || sid == nil {
		return nil, fmt.Errorf("create or open AppContainer profile %q failed (HRESULT 0x%08x)", name, uint32(status))
	}
	return sid, nil
}

func grantAppContainerWorkspaceAccess(workspace string, appContainerSID *windows.SID) error {
	user, err := windows.GetCurrentProcessToken().GetTokenUser()
	if err != nil {
		return fmt.Errorf("get sandbox worker identity: %w", err)
	}
	entries := []windows.EXPLICIT_ACCESS{
		{AccessPermissions: windows.GENERIC_ALL, AccessMode: windows.SET_ACCESS, Inheritance: windows.OBJECT_INHERIT_ACE | windows.CONTAINER_INHERIT_ACE, Trustee: windows.TRUSTEE{TrusteeForm: windows.TRUSTEE_IS_SID, TrusteeType: windows.TRUSTEE_IS_USER, TrusteeValue: windows.TrusteeValueFromSID(user.User.Sid)}},
		{AccessPermissions: windows.GENERIC_ALL, AccessMode: windows.GRANT_ACCESS, Inheritance: windows.OBJECT_INHERIT_ACE | windows.CONTAINER_INHERIT_ACE, Trustee: windows.TRUSTEE{TrusteeForm: windows.TRUSTEE_IS_SID, TrusteeType: windows.TRUSTEE_IS_USER, TrusteeValue: windows.TrusteeValueFromSID(appContainerSID)}},
	}
	acl, err := windows.ACLFromEntries(entries, nil)
	if err != nil {
		return fmt.Errorf("build AppContainer workspace ACL: %w", err)
	}
	if err := windows.SetNamedSecurityInfo(workspace, windows.SE_FILE_OBJECT, windows.DACL_SECURITY_INFORMATION|windows.PROTECTED_DACL_SECURITY_INFORMATION, nil, nil, acl, nil); err != nil {
		return fmt.Errorf("restrict AppContainer workspace ACL: %w", err)
	}
	return nil
}

func launchAppContainerCommand(workspace, command string, timeoutSec int, sid *windows.SID) (commandResult, error) {
	stdoutRead, stdoutWrite, err := newAppContainerPipe()
	if err != nil {
		return commandResult{}, err
	}
	defer stdoutRead.Close()
	stderrRead, stderrWrite, err := newAppContainerPipe()
	if err != nil {
		stdoutWrite.Close()
		return commandResult{}, err
	}
	defer stderrRead.Close()
	stdinRead, stdinWrite, err := newAppContainerPipe()
	if err != nil {
		stdoutWrite.Close()
		stderrWrite.Close()
		return commandResult{}, err
	}

	var stdout, stderr bytes.Buffer
	readDone := make(chan error, 2)
	go appContainerReadPipe(stdoutRead, &stdout, readDone)
	go appContainerReadPipe(stderrRead, &stderr, readDone)

	attributes, err := windows.NewProcThreadAttributeList(2)
	if err != nil {
		closeAppContainerPipeEnds(stdinRead, stdinWrite, stdoutWrite, stderrWrite)
		return commandResult{}, fmt.Errorf("create AppContainer process attributes: %w", err)
	}
	defer attributes.Delete()
	capabilities := appContainerSecurityCapabilities{AppContainerSid: sid}
	if err := attributes.Update(procThreadAttributeSecurityCapabilities, unsafe.Pointer(&capabilities), unsafe.Sizeof(capabilities)); err != nil {
		closeAppContainerPipeEnds(stdinRead, stdinWrite, stdoutWrite, stderrWrite)
		return commandResult{}, fmt.Errorf("set AppContainer security capabilities: %w", err)
	}
	handles := []windows.Handle{windows.Handle(stdinRead.Fd()), windows.Handle(stdoutWrite.Fd()), windows.Handle(stderrWrite.Fd())}
	if err := attributes.Update(windows.PROC_THREAD_ATTRIBUTE_HANDLE_LIST, unsafe.Pointer(&handles[0]), unsafe.Sizeof(handles[0])*uintptr(len(handles))); err != nil {
		closeAppContainerPipeEnds(stdinRead, stdinWrite, stdoutWrite, stderrWrite)
		return commandResult{}, fmt.Errorf("set AppContainer standard handles: %w", err)
	}

	systemDirectory, err := windows.GetSystemDirectory()
	if err != nil {
		closeAppContainerPipeEnds(stdinRead, stdinWrite, stdoutWrite, stderrWrite)
		return commandResult{}, fmt.Errorf("locate cmd.exe for AppContainer: %w", err)
	}
	cmdPath := filepath.Join(systemDirectory, "cmd.exe")
	application, err := windows.UTF16PtrFromString(cmdPath)
	if err != nil {
		closeAppContainerPipeEnds(stdinRead, stdinWrite, stdoutWrite, stderrWrite)
		return commandResult{}, err
	}
	commandLineText := strings.Join([]string{syscall.EscapeArg(cmdPath), "/d", "/s", "/c", syscall.EscapeArg("chcp 65001>nul & " + command)}, " ")
	commandLine, err := windows.UTF16FromString(commandLineText)
	if err != nil {
		closeAppContainerPipeEnds(stdinRead, stdinWrite, stdoutWrite, stderrWrite)
		return commandResult{}, err
	}
	currentDirectory, err := windows.UTF16PtrFromString(workspace)
	if err != nil {
		closeAppContainerPipeEnds(stdinRead, stdinWrite, stdoutWrite, stderrWrite)
		return commandResult{}, err
	}
	startup := windows.StartupInfoEx{
		StartupInfo: windows.StartupInfo{
			Cb:        uint32(unsafe.Sizeof(windows.StartupInfoEx{})),
			Flags:     windows.STARTF_USESTDHANDLES,
			StdInput:  windows.Handle(stdinRead.Fd()),
			StdOutput: windows.Handle(stdoutWrite.Fd()),
			StdErr:    windows.Handle(stderrWrite.Fd()),
		},
		ProcThreadAttributeList: attributes.List(),
	}
	process := new(windows.ProcessInformation)
	err = windows.CreateProcess(application, &commandLine[0], nil, nil, true, windows.CREATE_DEFAULT_ERROR_MODE|windows.CREATE_UNICODE_ENVIRONMENT|windows.CREATE_NO_WINDOW|windows.EXTENDED_STARTUPINFO_PRESENT, nil, currentDirectory, &startup.StartupInfo, process)
	closeAppContainerPipeEnds(stdinRead, stdinWrite, stdoutWrite, stderrWrite)
	if err != nil {
		return commandResult{}, fmt.Errorf("launch AppContainer command: %w", err)
	}
	defer windows.CloseHandle(process.Thread)
	defer windows.CloseHandle(process.Process)

	job, err := windows.CreateJobObject(nil, nil)
	if err != nil {
		return commandResult{}, fmt.Errorf("create AppContainer job: %w", err)
	}
	defer windows.CloseHandle(job)
	if err := windows.AssignProcessToJobObject(job, process.Process); err != nil {
		return commandResult{}, fmt.Errorf("assign AppContainer process to job: %w", err)
	}

	state, err := windows.WaitForSingleObject(process.Process, uint32(timeoutSec*1000))
	timedOut := state == waitTimeout
	if err != nil {
		return commandResult{}, fmt.Errorf("wait for AppContainer command: %w", err)
	}
	if timedOut {
		if err := windows.TerminateJobObject(job, 1); err != nil {
			return commandResult{}, fmt.Errorf("terminate timed out AppContainer command: %w", err)
		}
		_, _ = windows.WaitForSingleObject(process.Process, windows.INFINITE)
	}
	if state != windows.WAIT_OBJECT_0 && !timedOut {
		return commandResult{}, fmt.Errorf("unexpected AppContainer command wait state 0x%08x", state)
	}
	if err := <-readDone; err != nil {
		return commandResult{}, fmt.Errorf("read AppContainer stdout: %w", err)
	}
	if err := <-readDone; err != nil {
		return commandResult{}, fmt.Errorf("read AppContainer stderr: %w", err)
	}
	stdoutText := strings.TrimSpace(decodeCommandOutput(stdout.Bytes()))
	stderrText := strings.TrimSpace(decodeCommandOutput(stderr.Bytes()))
	output := strings.TrimSpace(joinCommandOutput(stdoutText, stderrText))
	result := commandResult{Result: output, Output: output, Stdout: stdoutText, Stderr: stderrText}
	var exitCode uint32
	if err := windows.GetExitCodeProcess(process.Process, &exitCode); err != nil {
		return result, fmt.Errorf("get AppContainer command exit code: %w", err)
	}
	if timedOut {
		return result, fmt.Errorf("command timed out after %d seconds", timeoutSec)
	}
	if exitCode != 0 {
		code := int(exitCode)
		result.ExitCode = &code
		return result, fmt.Errorf("sandbox command failed with exit code %d", exitCode)
	}
	if result.Result == "" {
		result.Result = "Command completed with no output"
		result.Output = result.Result
	}
	return result, nil
}

func newAppContainerPipe() (*os.File, *os.File, error) {
	attributes := windows.SecurityAttributes{Length: uint32(unsafe.Sizeof(windows.SecurityAttributes{})), InheritHandle: 1}
	var readHandle, writeHandle windows.Handle
	if err := windows.CreatePipe(&readHandle, &writeHandle, &attributes, 0); err != nil {
		return nil, nil, err
	}
	if err := windows.SetHandleInformation(readHandle, windows.HANDLE_FLAG_INHERIT, 0); err != nil {
		windows.CloseHandle(readHandle)
		windows.CloseHandle(writeHandle)
		return nil, nil, err
	}
	return os.NewFile(uintptr(readHandle), "appcontainer-pipe-read"), os.NewFile(uintptr(writeHandle), "appcontainer-pipe-write"), nil
}

func appContainerReadPipe(file *os.File, output *bytes.Buffer, done chan<- error) {
	_, err := io.Copy(output, file)
	done <- err
}

func closeAppContainerPipeEnds(files ...*os.File) {
	for _, file := range files {
		if file != nil {
			_ = file.Close()
		}
	}
}
