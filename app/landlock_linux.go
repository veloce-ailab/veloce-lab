//go:build linux

package main

// Landlock, applied by the agent to itself.
//
// `landlock_restrict_self` can only ever remove access from the calling process,
// so it has to happen in the process that is about to run the command: this
// binary re-executes itself with `-sandbox-landlock`, the child installs the
// ruleset and then becomes the shell. No root, no namespaces and no external
// tool are involved, which is what makes it work on hosts where bubblewrap
// cannot start — a container without user namespaces, for instance.
//
// The rule set removes every right that writes, outside the writable roots. What
// is left — reads and execs — matches the bubblewrap backend's read-only view of
// the world; the difference is only in how the refusal reaches the caller.

import (
	"errors"
	"fmt"
	"os"
	"os/exec"
	"runtime"
	"syscall"
	"unsafe"
)

const (
	// The fixed syscall triple Landlock was allocated. An architecture with a
	// different numbering reports "not available" below rather than calling
	// something else.
	sysLandlockCreateRuleset = 444
	sysLandlockAddRule       = 445
	sysLandlockRestrictSelf  = 446

	landlockRulePathBeneath = 1
	landlockCreateVersion   = 1
	prSetNoNewPrivs         = 38
	linuxOPath              = 0x200000 // O_PATH, not in the syscall package
)

// Filesystem rights a ruleset can handle. The ABI tells us which of the newer
// ones this kernel knows: asking for a right it does not implement fails the
// whole call.
const (
	accessFSWriteFile  uint64 = 1 << 1
	accessFSRemoveDir  uint64 = 1 << 4
	accessFSRemoveFile uint64 = 1 << 5
	accessFSMakeChar   uint64 = 1 << 6
	accessFSMakeDir    uint64 = 1 << 7
	accessFSMakeReg    uint64 = 1 << 8
	accessFSMakeSock   uint64 = 1 << 9
	accessFSMakeFifo   uint64 = 1 << 10
	accessFSMakeBlock  uint64 = 1 << 11
	accessFSMakeSym    uint64 = 1 << 12
	accessFSRefer      uint64 = 1 << 13 // ABI 2
	accessFSTruncate   uint64 = 1 << 14 // ABI 3
)

type landlockRulesetAttr struct {
	handledAccessFS uint64
}

// The kernel's struct is packed (8 + 4 = 12 bytes); Go's alignment pads it to
// 16, and only the leading bytes are ever read.
type landlockPathBeneathAttr struct {
	allowedAccess uint64
	parentFD      int32
}

func landlockSyscalls() (create, add, restrict uintptr, ok bool) {
	switch runtime.GOARCH {
	case "amd64", "arm64", "386", "arm":
		return sysLandlockCreateRuleset, sysLandlockAddRule, sysLandlockRestrictSelf, true
	}
	return 0, 0, 0, false
}

func landlockWriteRights(abi uint64) uint64 {
	rights := accessFSWriteFile | accessFSRemoveDir | accessFSRemoveFile |
		accessFSMakeChar | accessFSMakeDir | accessFSMakeReg |
		accessFSMakeSock | accessFSMakeFifo | accessFSMakeBlock | accessFSMakeSym
	if abi >= 2 {
		rights |= accessFSRefer
	}
	if abi >= 3 {
		rights |= accessFSTruncate
	}
	return rights
}

// landlockABI asks the kernel which Landlock version it implements. This is a
// query and restricts nothing, so the parent process may call it freely.
func landlockABI() (uint64, error) {
	create, _, _, ok := landlockSyscalls()
	if !ok {
		return 0, fmt.Errorf("no Landlock syscall numbering for %s", runtime.GOARCH)
	}
	version, _, errno := syscall.Syscall(create, 0, 0, landlockCreateVersion)
	if errno != 0 {
		return 0, fmt.Errorf("Landlock is not available on this kernel (%v)", errno)
	}
	if version < 1 || version > 20 {
		return 0, fmt.Errorf("unexpected Landlock ABI %d", version)
	}
	return uint64(version), nil
}

// landlockAvailable returns "" when a ruleset can be applied on this host, and
// the reason it cannot otherwise.
func landlockAvailable() string {
	if _, err := landlockABI(); err != nil {
		return err.Error()
	}
	return ""
}

// applyLandlock confines this process for good: after it returns, writes outside
// the roots fail in the kernel.
func applyLandlock(roots []string) error {
	abi, err := landlockABI()
	if err != nil {
		return err
	}
	create, add, restrict, _ := landlockSyscalls()
	attr := landlockRulesetAttr{handledAccessFS: landlockWriteRights(abi)}
	fd, _, errno := syscall.Syscall(create, uintptr(unsafe.Pointer(&attr)), unsafe.Sizeof(attr), 0)
	if errno != 0 {
		return fmt.Errorf("landlock_create_ruleset: %v", errno)
	}
	defer syscall.Close(int(fd))
	added := 0
	for _, root := range roots {
		parent, openErr := syscall.Open(root, linuxOPath|syscall.O_CLOEXEC, 0)
		if openErr != nil {
			// A root that is not there grants nothing; the caller already
			// filtered the standard ones, so this is not fatal on its own.
			fmt.Fprintf(os.Stderr, "landlock-exec: skipping %s: %v\n", root, openErr)
			continue
		}
		path := landlockPathBeneathAttr{allowedAccess: attr.handledAccessFS, parentFD: int32(parent)}
		_, _, ruleErr := syscall.Syscall6(add, fd, landlockRulePathBeneath, uintptr(unsafe.Pointer(&path)), 0, 0, 0)
		syscall.Close(parent)
		if ruleErr != 0 {
			return fmt.Errorf("landlock_add_rule(%s): %v", root, ruleErr)
		}
		added++
	}
	if added == 0 {
		return errors.New("no writable root was usable")
	}
	// Landlock refuses to restrict a process that could still gain privileges.
	if _, _, errno := syscall.Syscall(syscall.SYS_PRCTL, prSetNoNewPrivs, 1, 0); errno != 0 {
		return fmt.Errorf("prctl(PR_SET_NO_NEW_PRIVS): %v", errno)
	}
	if _, _, errno := syscall.Syscall(restrict, fd, 0, 0); errno != 0 {
		return fmt.Errorf("landlock_restrict_self: %v", errno)
	}
	return nil
}

// runLandlockLauncher is the `-sandbox-landlock` entry point: it applies the
// ruleset to this process and then becomes the command, so the command starts
// already confined. Exit 125 means the launcher refused to start (the caller may
// fall back), 127 means the command was not found.
func runLandlockLauncher(argv []string) int {
	separator := -1
	for index, arg := range argv {
		if arg == "--" {
			separator = index
			break
		}
	}
	if separator < 1 || separator == len(argv)-1 {
		fmt.Fprintln(os.Stderr, "landlock-exec: usage: -sandbox-landlock <writable-root>... -- <command> [args...]")
		return 125
	}
	if err := applyLandlock(argv[:separator]); err != nil {
		fmt.Fprintf(os.Stderr, "landlock-exec: %v\n", err)
		return 125
	}
	binary, err := exec.LookPath(argv[separator+1])
	if err != nil {
		fmt.Fprintf(os.Stderr, "landlock-exec: %s: %v\n", argv[separator+1], err)
		return 127
	}
	if err := syscall.Exec(binary, argv[separator+1:], os.Environ()); err != nil {
		fmt.Fprintf(os.Stderr, "landlock-exec: %s: %v\n", binary, err)
		return 127
	}
	return 0
}
