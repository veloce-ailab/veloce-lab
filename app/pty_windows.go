//go:build windows

package main

import (
	"fmt"
	"os"
	"sync"
	"unsafe"

	"golang.org/x/sys/windows"
)

var (
	kernel32                = windows.NewLazySystemDLL("kernel32.dll")
	procCreatePseudoConsole = kernel32.NewProc("CreatePseudoConsole")
)

// ptyProcess drives a child process attached to a Windows pseudo console
// (ConPTY), so the shell believes it owns a real terminal and emits the same
// VT sequences a console host would receive.
type ptyProcess struct {
	console windows.Handle
	process windows.Handle
	thread  windows.Handle
	input   *os.File
	output  *os.File

	closeOnce sync.Once
	waitOnce  sync.Once
	exitCode  int
	waitErr   error
	waitDone  chan struct{}
}

func conPTYSupported() bool {
	return procCreatePseudoConsole.Find() == nil
}

func startPTY(shell string, args []string, dir string, cols uint16, rows uint16) (*ptyProcess, error) {
	if !conPTYSupported() {
		return nil, fmt.Errorf("this Windows build has no pseudo console support")
	}
	cols, rows = normalizePTYSize(cols, rows)

	// ConPTY reads the child's stdin from inputRead and writes its output to
	// outputWrite; we keep the opposite ends.
	var inputRead, inputWrite windows.Handle
	if err := windows.CreatePipe(&inputRead, &inputWrite, nil, 0); err != nil {
		return nil, err
	}
	var outputRead, outputWrite windows.Handle
	if err := windows.CreatePipe(&outputRead, &outputWrite, nil, 0); err != nil {
		windows.CloseHandle(inputRead)
		windows.CloseHandle(inputWrite)
		return nil, err
	}

	var console windows.Handle
	if err := windows.CreatePseudoConsole(windows.Coord{X: int16(cols), Y: int16(rows)}, inputRead, outputWrite, 0, &console); err != nil {
		windows.CloseHandle(inputRead)
		windows.CloseHandle(outputWrite)
		windows.CloseHandle(inputWrite)
		windows.CloseHandle(outputRead)
		return nil, fmt.Errorf("CreatePseudoConsole failed: %w", err)
	}

	process, thread, err := startConPTYProcess(console, shell, args, dir)
	// The pseudo console only needs these pipe ends while the client process is
	// being attached. After CreateProcess returns, release our references so EOF
	// and teardown are driven by the pseudo console itself.
	windows.CloseHandle(inputRead)
	windows.CloseHandle(outputWrite)
	if err != nil {
		windows.ClosePseudoConsole(console)
		windows.CloseHandle(inputWrite)
		windows.CloseHandle(outputRead)
		return nil, err
	}

	pty := &ptyProcess{
		console:  console,
		process:  process,
		thread:   thread,
		input:    os.NewFile(uintptr(inputWrite), "conpty-input"),
		output:   os.NewFile(uintptr(outputRead), "conpty-output"),
		waitDone: make(chan struct{}),
	}
	return pty, nil
}

func startConPTYProcess(console windows.Handle, shell string, args []string, dir string) (windows.Handle, windows.Handle, error) {
	executable, err := windows.UTF16PtrFromString(shell)
	if err != nil {
		return 0, 0, err
	}
	commandLine, err := windows.UTF16PtrFromString(windows.ComposeCommandLine(append([]string{shell}, args...)))
	if err != nil {
		return 0, 0, err
	}
	var workingDir *uint16
	if dir != "" {
		if workingDir, err = windows.UTF16PtrFromString(dir); err != nil {
			return 0, 0, err
		}
	}

	attributes, err := windows.NewProcThreadAttributeList(1)
	if err != nil {
		return 0, 0, err
	}
	defer attributes.Delete()
	if err := attributes.Update(windows.PROC_THREAD_ATTRIBUTE_PSEUDOCONSOLE, unsafe.Pointer(console), unsafe.Sizeof(console)); err != nil {
		return 0, 0, err
	}

	startupInfo := &windows.StartupInfoEx{
		StartupInfo:             windows.StartupInfo{Cb: uint32(unsafe.Sizeof(windows.StartupInfoEx{})), Flags: windows.STARTF_USESTDHANDLES},
		ProcThreadAttributeList: attributes.List(),
	}
	securityAttributes := &windows.SecurityAttributes{
		Length:        uint32(unsafe.Sizeof(windows.SecurityAttributes{})),
		InheritHandle: 1,
	}
	var processInfo windows.ProcessInformation
	err = windows.CreateProcess(
		executable,
		commandLine,
		securityAttributes,
		securityAttributes,
		false,
		windows.CREATE_UNICODE_ENVIRONMENT|windows.EXTENDED_STARTUPINFO_PRESENT,
		nil,
		workingDir,
		&startupInfo.StartupInfo,
		&processInfo,
	)
	if err != nil {
		return 0, 0, err
	}
	return processInfo.Process, processInfo.Thread, nil
}

func (pty *ptyProcess) Read(buffer []byte) (int, error) {
	return pty.output.Read(buffer)
}

func (pty *ptyProcess) Write(data []byte) (int, error) {
	return pty.input.Write(data)
}

func (pty *ptyProcess) Resize(cols uint16, rows uint16) error {
	cols, rows = normalizePTYSize(cols, rows)
	return windows.ResizePseudoConsole(pty.console, windows.Coord{X: int16(cols), Y: int16(rows)})
}

// Wait blocks until the shell exits and reports its exit code.
func (pty *ptyProcess) Wait() (int, error) {
	pty.waitOnce.Do(func() {
		defer close(pty.waitDone)
		if _, err := windows.WaitForSingleObject(pty.process, windows.INFINITE); err != nil {
			pty.waitErr = err
			return
		}
		var code uint32
		if err := windows.GetExitCodeProcess(pty.process, &code); err != nil {
			pty.waitErr = err
			return
		}
		pty.exitCode = int(int32(code))
	})
	<-pty.waitDone
	return pty.exitCode, pty.waitErr
}

// Close asks the shell to exit by closing its input, then tears the console
// down. Readers see EOF once the console is gone.
func (pty *ptyProcess) Close() error {
	pty.closeOnce.Do(func() {
		pty.input.Close()
		windows.ClosePseudoConsole(pty.console)
		pty.output.Close()
		windows.CloseHandle(pty.thread)
		windows.CloseHandle(pty.process)
	})
	return nil
}

// Kill terminates the shell without waiting for it to notice the closed input.
func (pty *ptyProcess) Kill() error {
	return windows.TerminateProcess(pty.process, 1)
}
