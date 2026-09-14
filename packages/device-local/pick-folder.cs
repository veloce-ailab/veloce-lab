// The modern Windows folder picker: IFileOpenDialog with FOS_PICKFOLDERS, which
// is the same "Select Folder" dialog Explorer itself shows — navigation pane,
// breadcrumb bar, search and a New folder button. WinForms' FolderBrowserDialog,
// which this replaced, is the Windows 95-era tree dialog.
//
// Interop only; the surrounding script owns the fallbacks. Keeping it in its own
// file means it can be compiled and checked on its own.
using System;
using System.IO;
using System.Runtime.InteropServices;

public static class VeloceFolderPicker
{
    private const uint FOS_PICKFOLDERS = 0x00000020;
    private const uint FOS_FORCEFILESYSTEM = 0x00000040;
    private const uint FOS_PATHMUSTEXIST = 0x00000800;
    private const uint SIGDN_FILESYSPATH = 0x80058000;
    private const int ERROR_CANCELLED = unchecked((int)0x800704C7);

    [ComImport, Guid("DC1C5A9C-E88A-4dde-A5A1-60F82A20AEF7")]
    private class FileOpenDialog
    {
    }

    // The vtable order below is the order the COM interface declares, so it must
    // not be rearranged.
    [ComImport, Guid("42f85136-db7e-439c-85f1-e4075d135fc8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IFileDialog
    {
        [PreserveSig]
        int Show(IntPtr parent);
        void SetFileTypes(uint cFileTypes, IntPtr rgFilterSpec);
        void SetFileTypeIndex(uint iFileType);
        void GetFileTypeIndex(out uint piFileType);
        void Advise(IntPtr pfde, out uint pdwCookie);
        void Unadvise(uint dwCookie);
        void SetOptions(uint fos);
        void GetOptions(out uint pfos);
        void SetDefaultFolder(IShellItem psi);
        void SetFolder(IShellItem psi);
        void GetFolder(out IShellItem ppsi);
        void GetCurrentSelection(out IShellItem ppsi);
        void SetFileName([MarshalAs(UnmanagedType.LPWStr)] string pszName);
        void GetFileName([MarshalAs(UnmanagedType.LPWStr)] out string pszName);
        void SetTitle([MarshalAs(UnmanagedType.LPWStr)] string pszTitle);
        void SetOkButtonLabel([MarshalAs(UnmanagedType.LPWStr)] string pszText);
        void SetFileNameLabel([MarshalAs(UnmanagedType.LPWStr)] string pszLabel);
        void GetResult(out IShellItem ppsi);
        void AddPlace(IShellItem psi, int fdap);
        void SetDefaultExtension([MarshalAs(UnmanagedType.LPWStr)] string pszDefaultExtension);
        [PreserveSig]
        int Close(int hr);
        void SetClientGuid(ref Guid guid);
        void ClearClientData();
        void SetFilter(IntPtr pFilter);
    }

    [ComImport, Guid("43826d1e-e718-42ee-bc55-a1e261c37bfe"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IShellItem
    {
        void BindToHandler(IntPtr pbc, ref Guid bhid, ref Guid riid, out IntPtr ppv);
        void GetParent(out IShellItem ppsi);
        void GetDisplayName(uint sigdnName, out IntPtr ppszName);
        void GetAttributes(uint sfgaoMask, out uint psfgaoAttribs);
        void Compare(IShellItem psi, uint hint, out int piOrder);
    }

    [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = false)]
    private static extern void SHCreateItemFromParsingName(
        [MarshalAs(UnmanagedType.LPWStr)] string pszPath,
        IntPtr pbc,
        ref Guid riid,
        [MarshalAs(UnmanagedType.Interface)] out IShellItem ppv);

    /// <summary>
    /// Shows the dialog and returns the chosen folder. Returns an empty string
    /// when the user dismissed it, and null when this machine cannot show the
    /// modern dialog at all — the caller then falls back to an older one.
    /// </summary>
    public static string Pick(string title, string initialPath)
    {
        IFileDialog dialog;
        try
        {
            dialog = (IFileDialog)new FileOpenDialog();
        }
        catch (COMException)
        {
            return null;
        }
        catch (InvalidCastException)
        {
            return null;
        }

        try
        {
            uint options;
            dialog.GetOptions(out options);
            dialog.SetOptions(options | FOS_PICKFOLDERS | FOS_FORCEFILESYSTEM | FOS_PATHMUSTEXIST);

            // A starting folder that no longer exists must not stop the dialog.
            if (!string.IsNullOrEmpty(initialPath) && Directory.Exists(initialPath))
            {
                try
                {
                    Guid iid = typeof(IShellItem).GUID;
                    IShellItem folder;
                    SHCreateItemFromParsingName(initialPath, IntPtr.Zero, ref iid, out folder);
                    dialog.SetFolder(folder);
                    Marshal.ReleaseComObject(folder);
                }
                catch (Exception)
                {
                }
            }

            if (!string.IsNullOrEmpty(title))
            {
                dialog.SetTitle(title);
            }

            int hr = dialog.Show(IntPtr.Zero);
            if (hr == ERROR_CANCELLED)
            {
                return string.Empty;
            }
            if (hr != 0)
            {
                throw new COMException("The folder dialog failed with 0x" + hr.ToString("X8"), hr);
            }

            IShellItem result;
            dialog.GetResult(out result);
            IntPtr buffer;
            result.GetDisplayName(SIGDN_FILESYSPATH, out buffer);
            string path = Marshal.PtrToStringUni(buffer);
            Marshal.FreeCoTaskMem(buffer);
            Marshal.ReleaseComObject(result);
            return path ?? string.Empty;
        }
        finally
        {
            Marshal.ReleaseComObject(dialog);
        }
    }
}
