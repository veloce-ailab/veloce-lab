// Applies a Landlock ruleset to itself, then becomes the command.
//
// This is the launcher for hosts where bubblewrap cannot run (a container
// without user namespaces, a machine without bwrap installed). Landlock is an
// unprivileged LSM: a process can only ever *remove* its own file access, needs
// no root and no namespaces, and the restriction is inherited across execve —
// which is exactly what turns "the workspace is the only writable folder" into
// something the kernel enforces.
//
//   landlock-exec <writable-root>... -- <command> [argument...]
//
// Every filesystem right that can create, remove, rename or rewrite content is
// handled by the ruleset and allowed beneath the given roots only. Reads and
// execs are left alone, matching what the bubblewrap backend does by mounting
// the rest of the world read-only: the difference is in how the refusal reaches
// the caller, not in what a command may touch.
//
// Exit codes: 125 is this launcher refusing to start (so the caller can fall
// back to another backend), 127 is the command not being found.
#define _GNU_SOURCE

#include <errno.h>
#include <fcntl.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/prctl.h>
#include <sys/syscall.h>
#include <unistd.h>

// Landlock was allocated a fixed syscall triple on the architectures this
// project ships a connector for. An architecture with a different numbering
// answers ENOSYS, and the ABI check below then reports it as unavailable rather
// than mistaking some other syscall for a ruleset.
#ifndef __NR_landlock_create_ruleset
#define __NR_landlock_create_ruleset 444
#endif
#ifndef __NR_landlock_add_rule
#define __NR_landlock_add_rule 445
#endif
#ifndef __NR_landlock_restrict_self
#define __NR_landlock_restrict_self 446
#endif

#define LANDLOCK_CREATE_RULESET_VERSION (1u << 0)
#define LANDLOCK_RULE_PATH_BENEATH 1

/* ABI 1: the original filesystem rights. */
#define ACCESS_FS_EXECUTE (1ull << 0)
#define ACCESS_FS_WRITE_FILE (1ull << 1)
#define ACCESS_FS_READ_FILE (1ull << 2)
#define ACCESS_FS_READ_DIR (1ull << 3)
#define ACCESS_FS_REMOVE_DIR (1ull << 4)
#define ACCESS_FS_REMOVE_FILE (1ull << 5)
#define ACCESS_FS_MAKE_CHAR (1ull << 6)
#define ACCESS_FS_MAKE_DIR (1ull << 7)
#define ACCESS_FS_MAKE_REG (1ull << 8)
#define ACCESS_FS_MAKE_SOCK (1ull << 9)
#define ACCESS_FS_MAKE_FIFO (1ull << 10)
#define ACCESS_FS_MAKE_BLOCK (1ull << 11)
#define ACCESS_FS_MAKE_SYM (1ull << 12)
/* ABI 2 and 3 added rights that the kernel rejects on older releases. */
#define ACCESS_FS_REFER (1ull << 13)
#define ACCESS_FS_TRUNCATE (1ull << 14)

/* The kernel copies the fields it knows about and ignores the rest, so passing
 * the original shape stays valid on every ABI. */
struct landlock_ruleset_attr {
  uint64_t handled_access_fs;
};

struct landlock_path_beneath_attr {
  uint64_t allowed_access;
  int32_t parent_fd;
} __attribute__((packed));

static void fail(const char *what) {
  fprintf(stderr, "landlock-exec: %s: %s\n", what, strerror(errno));
  exit(125);
}

static long create_ruleset(const struct landlock_ruleset_attr *attr,
                           size_t size, uint32_t flags) {
  return syscall(__NR_landlock_create_ruleset, attr, size, flags);
}

/* Every right that writes: the set the sandbox removes outside its roots. */
static uint64_t write_rights(long abi) {
  uint64_t rights = ACCESS_FS_WRITE_FILE | ACCESS_FS_REMOVE_DIR |
                    ACCESS_FS_REMOVE_FILE | ACCESS_FS_MAKE_CHAR |
                    ACCESS_FS_MAKE_DIR | ACCESS_FS_MAKE_REG |
                    ACCESS_FS_MAKE_SOCK | ACCESS_FS_MAKE_FIFO |
                    ACCESS_FS_MAKE_BLOCK | ACCESS_FS_MAKE_SYM;
  if (abi >= 2) {
    rights |= ACCESS_FS_REFER;
  }
  if (abi >= 3) {
    rights |= ACCESS_FS_TRUNCATE;
  }
  return rights;
}

int main(int argc, char **argv) {
  int separator = -1;
  for (int index = 1; index < argc; index += 1) {
    if (strcmp(argv[index], "--") == 0) {
      separator = index;
      break;
    }
  }
  if (separator < 2 || separator == argc - 1) {
    fprintf(stderr,
            "usage: landlock-exec <writable-root>... -- <command> [args...]\n");
    return 125;
  }

  // A ruleset of "everything except writes" needs the ABI to know which rights
  // this kernel has; a value outside the released range means the syscall table
  // is not the one this launcher was written against.
  errno = 0;
  long abi = create_ruleset(NULL, 0, LANDLOCK_CREATE_RULESET_VERSION);
  if (abi < 1 || abi > 20) {
    fprintf(stderr, "landlock-exec: Landlock is not available on this kernel\n");
    return 125;
  }

  struct landlock_ruleset_attr attr = {.handled_access_fs = write_rights(abi)};
  int ruleset = (int)create_ruleset(&attr, sizeof(attr), 0);
  if (ruleset < 0) {
    fail("landlock_create_ruleset");
  }

  int roots = 0;
  for (int index = 1; index < separator; index += 1) {
    int parent = open(argv[index], O_PATH | O_CLOEXEC);
    if (parent < 0) {
      // A root that is not there grants nothing; the caller already filtered
      // the standard ones, so this is not worth failing the whole run over.
      fprintf(stderr, "landlock-exec: skipping %s: %s\n", argv[index],
              strerror(errno));
      continue;
    }
    struct landlock_path_beneath_attr path = {
        .allowed_access = attr.handled_access_fs,
        .parent_fd = parent,
    };
    long added = syscall(__NR_landlock_add_rule, ruleset,
                         LANDLOCK_RULE_PATH_BENEATH, &path, 0);
    if (added < 0) {
      fail("landlock_add_rule");
    }
    close(parent);
    roots += 1;
  }
  if (roots == 0) {
    fprintf(stderr, "landlock-exec: no writable root was usable\n");
    return 125;
  }

  // Landlock refuses to restrict a process that could still gain privileges;
  // this is the same prerequisite bubblewrap satisfies through namespaces.
  if (prctl(PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0) < 0) {
    fail("prctl(PR_SET_NO_NEW_PRIVS)");
  }
  if (syscall(__NR_landlock_restrict_self, ruleset, 0) < 0) {
    fail("landlock_restrict_self");
  }
  close(ruleset);

  execvp(argv[separator + 1], argv + separator + 1);
  fprintf(stderr, "landlock-exec: %s: %s\n", argv[separator + 1],
          strerror(errno));
  return 127;
}
