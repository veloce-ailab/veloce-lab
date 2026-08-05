package service

// IsPrimaryNode remains as a compatibility point for scheduled jobs. This
// distribution only supports one process, so it always owns local background work.
func IsPrimaryNode() bool {
	return true
}
