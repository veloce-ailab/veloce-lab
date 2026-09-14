<#
.SYNOPSIS
  Opens the modern Windows folder picker and prints the chosen folder.

.DESCRIPTION
  The dialog is the same one Explorer shows for "Select folder": IFileOpenDialog
  with FOS_PICKFOLDERS, defined in pick-folder.cs next to this script. If that
  cannot be shown on this machine, two older pickers stand in, in order:

    1. Shell.Application's BrowseForFolder with BIF_NEWDIALOGSTYLE — resizable,
       with a text box and a New folder button;
    2. WinForms' FolderBrowserDialog — the Windows 95-era tree dialog, kept only
       so that folder selection keeps working on a machine where neither of the
       others can run.

  Notes for whoever calls this:
    * it must run in a single-threaded apartment (powershell.exe -STA), or the
      shell dialogs refuse to open;
    * the chosen folder goes to stdout; an empty stdout means the user dismissed
      the dialog;
    * an unexpected failure writes to stderr and exits 2, so a broken
      environment cannot be mistaken for the user cancelling.

.PARAMETER Title
  Dialog caption.

.PARAMETER InitialPath
  Folder the dialog opens in, when it still exists.
#>
param(
  [string]$Title = "Select a folder",
  [string]$InitialPath = ""
)

$ErrorActionPreference = "Stop"

function Show-ModernDialog {
  $source = Join-Path $PSScriptRoot "pick-folder.cs"
  if (-not (Test-Path -LiteralPath $source)) { return $null }
  Add-Type -Path $source -ErrorAction Stop | Out-Null
  return [VeloceFolderPicker]::Pick($Title, $InitialPath)
}

function Show-ShellDialog {
  $shell = New-Object -ComObject Shell.Application
  $start = 0
  if ($InitialPath -and (Test-Path -LiteralPath $InitialPath -PathType Container)) {
    $start = $shell.NameSpace($InitialPath)
  }
  # BIF_RETURNONLYFSDIRS | BIF_EDITBOX | BIF_NEWDIALOGSTYLE
  $flags = 0x00000001 -bor 0x00000010 -bor 0x00000040
  $folder = $shell.BrowseForFolder(0, $Title, $flags, $start)
  if ($null -eq $folder) { return "" }
  return $folder.Self.Path
}

function Show-LegacyDialog {
  Add-Type -AssemblyName System.Windows.Forms | Out-Null
  $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
  $dialog.UseDescriptionForTitle = $true
  $dialog.Description = $Title
  if ($InitialPath -and (Test-Path -LiteralPath $InitialPath -PathType Container)) {
    $dialog.SelectedPath = $InitialPath
  }
  if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { return $dialog.SelectedPath }
  return ""
}

$path = $null
try {
  $path = Show-ModernDialog
} catch {
  # The interop assembly is unavailable; an older picker is better than none.
  $path = $null
}

if ($null -eq $path) {
  try {
    $path = Show-ShellDialog
  } catch {
    $path = $null
  }
}

if ($null -eq $path) {
  try {
    $path = Show-LegacyDialog
  } catch {
    [Console]::Error.Write("No folder dialog is available on this machine: " + $_.Exception.Message)
    exit 2
  }
}

if ($path) { [Console]::Out.Write($path) }
