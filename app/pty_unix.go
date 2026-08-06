//go:build !windows

package main

import (
	"os"
	"os/exec"
	"sync"

	"github.com/creack/pty"
)

// ptyProcess drives a child process attached to a Unix pseudo terminal, so the
// shell runs with a controlling tty and behaves exactly as it would in a
// terminal emulator.
type ptyProcess struct {
	file *os.File
	cmd  *exec.Cmd

	closeOnce sync.Once
	waitOnce  sync.Once
	exitCode  int
	waitErr   error
	waitDone  chan struct{}
}

func startPTY(shell string, args []string, dir string, cols uint16, rows uint16) (*ptyProcess, error) {
	cols, rows = normalizePTYSize(cols, rows)
	cmd := exec.Command(shell, args...)
	if dir != "" {
		cmd.Dir = dir
	}
	cmd.Env = append(os.Environ(), "TERM=xterm-256color")
	file, err := pty.StartWithSize(cmd, &pty.Winsize{Cols: cols, Rows: rows})
	if err != nil {
		return nil, err
	}
	return &ptyProcess{file: file, cmd: cmd, waitDone: make(chan struct{})}, nil
}

func (session *ptyProcess) Read(buffer []byte) (int, error) {
	return session.file.Read(buffer)
}

func (session *ptyProcess) Write(data []byte) (int, error) {
	return session.file.Write(data)
}

func (session *ptyProcess) Resize(cols uint16, rows uint16) error {
	cols, rows = normalizePTYSize(cols, rows)
	return pty.Setsize(session.file, &pty.Winsize{Cols: cols, Rows: rows})
}

// Wait blocks until the shell exits and reports its exit code.
func (session *ptyProcess) Wait() (int, error) {
	session.waitOnce.Do(func() {
		defer close(session.waitDone)
		err := session.cmd.Wait()
		if exitErr, ok := err.(*exec.ExitError); ok {
			session.exitCode = exitErr.ExitCode()
			return
		}
		session.waitErr = err
	})
	<-session.waitDone
	return session.exitCode, session.waitErr
}

// Close closes the master side, which sends the shell EOF and hangs up its tty.
func (session *ptyProcess) Close() error {
	session.closeOnce.Do(func() {
		session.file.Close()
	})
	return nil
}

// Kill terminates the shell without waiting for it to notice the closed tty.
func (session *ptyProcess) Kill() error {
	if session.cmd.Process == nil {
		return nil
	}
	return session.cmd.Process.Kill()
}
