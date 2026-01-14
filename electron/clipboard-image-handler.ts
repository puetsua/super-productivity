import { ipcMain, clipboard } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { IPC } from './shared-with-frontend/ipc-events.const';

interface ClipboardImageMeta {
  id: string;
  mimeType: string;
  createdAt: number;
  size: number;
}

const SUPPORTED_IMAGE_EXTENSIONS = [
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.svg',
  '.bmp',
];

/**
 * Ensures the clipboard-images directory exists.
 */
const ensureDir = (dirPath: string): void => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

/**
 * Gets the MIME type from file extension.
 */
const getMimeFromExt = (ext: string): string => {
  const extLower = ext.toLowerCase();
  switch (extLower) {
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.gif':
      return 'image/gif';
    case '.webp':
      return 'image/webp';
    case '.svg':
      return 'image/svg+xml';
    case '.bmp':
      return 'image/bmp';
    default:
      return 'image/png';
  }
};

/**
 * Finds the image file by ID (checking various extensions).
 */
const findImageFile = (basePath: string, imageId: string): string | null => {
  for (const ext of SUPPORTED_IMAGE_EXTENSIONS) {
    const filePath = path.join(basePath, `${imageId}${ext}`);
    if (fs.existsSync(filePath)) {
      return filePath;
    }
  }

  return null;
};

export const initClipboardImageHandlers = (): void => {
  // Save clipboard image
  ipcMain.handle(
    IPC.CLIPBOARD_IMAGE_SAVE,
    async (_, args: { basePath: string; fileName: string; base64Data: string }) => {
      const { basePath, fileName, base64Data } = args;

      try {
        ensureDir(basePath);

        const filePath = path.join(basePath, fileName);
        const buffer = Buffer.from(base64Data, 'base64');

        fs.writeFileSync(filePath, new Uint8Array(buffer));

        return filePath;
      } catch (error) {
        console.error('Error saving clipboard image:', error);
        throw error;
      }
    },
  );

  // Load clipboard image
  ipcMain.handle(
    IPC.CLIPBOARD_IMAGE_LOAD,
    async (_, args: { basePath: string; imageId: string }) => {
      const { basePath, imageId } = args;

      try {
        const filePath = findImageFile(basePath, imageId);
        if (!filePath) {
          return null;
        }

        const buffer = fs.readFileSync(filePath);
        const ext = path.extname(filePath);
        const mimeType = getMimeFromExt(ext);

        return {
          base64: buffer.toString('base64'),
          mimeType,
        };
      } catch (error) {
        console.error('Error loading clipboard image:', error);
        return null;
      }
    },
  );

  // Delete clipboard image
  ipcMain.handle(
    IPC.CLIPBOARD_IMAGE_DELETE,
    async (_, args: { basePath: string; imageId: string }) => {
      const { basePath, imageId } = args;

      try {
        const filePath = findImageFile(basePath, imageId);
        if (!filePath) {
          return false;
        }

        fs.unlinkSync(filePath);
        return true;
      } catch (error) {
        console.error('Error deleting clipboard image:', error);
        return false;
      }
    },
  );

  // List clipboard images
  ipcMain.handle(IPC.CLIPBOARD_IMAGE_LIST, async (_, args: { basePath: string }) => {
    const { basePath } = args;

    try {
      if (!fs.existsSync(basePath)) {
        return [];
      }

      const files = fs.readdirSync(basePath);
      const imageExtensions = new Set(SUPPORTED_IMAGE_EXTENSIONS);

      const images: ClipboardImageMeta[] = [];

      for (const file of files) {
        const ext = path.extname(file).toLowerCase();
        if (!imageExtensions.has(ext)) {
          continue;
        }

        const filePath = path.join(basePath, file);
        const stats = fs.statSync(filePath);
        const id = path.basename(file, ext);

        images.push({
          id,
          mimeType: getMimeFromExt(ext),
          createdAt: stats.birthtimeMs,
          size: stats.size,
        });
      }

      return images;
    } catch (error) {
      console.error('Error listing clipboard images:', error);
      return [];
    }
  });

  // Get clipboard image file path
  ipcMain.handle(
    IPC.CLIPBOARD_IMAGE_GET_PATH,
    async (_, args: { basePath: string; imageId: string }) => {
      const { basePath, imageId } = args;

      try {
        return findImageFile(basePath, imageId);
      } catch (error) {
        console.error('Error getting clipboard image path:', error);
        return null;
      }
    },
  );

  // Get file paths from clipboard (when user copies files in file explorer)
  ipcMain.handle(IPC.CLIPBOARD_GET_FILE_PATHS, async () => {
    try {
      const formats = clipboard.availableFormats();
      const filePaths: string[] = [];

      // Windows: Check for file paths in clipboard
      if (process.platform === 'win32' && formats.includes('FileNameW')) {
        const filePathsData = clipboard.read('FileNameW');
        if (filePathsData && typeof filePathsData === 'string') {
          // Windows file paths are null-separated
          const paths = filePathsData
            .split('\0')
            .filter((p: string) => p.trim().length > 0);
          filePaths.push(...paths);
        }
      }

      // macOS: Check for file URLs
      if (process.platform === 'darwin' && formats.includes('public.file-url')) {
        const fileUrl = clipboard.read('public.file-url');
        if (fileUrl) {
          // Convert file:// URL to path
          const urlStr = fileUrl.toString();
          const match = urlStr.match(/file:\/\/(.+)/);
          if (match) {
            const decodedPath = decodeURIComponent(match[1]);
            filePaths.push(decodedPath);
          }
        }
      }

      // Linux: Check for file URIs
      if (process.platform === 'linux') {
        const text = clipboard.readText();
        if (text && text.startsWith('file://')) {
          const lines = text.split('\n');
          for (const line of lines) {
            if (line.startsWith('file://')) {
              const match = line.match(/file:\/\/(.+)/);
              if (match) {
                const decodedPath = decodeURIComponent(match[1]);
                filePaths.push(decodedPath);
              }
            }
          }
        }
      }

      // Filter to only existing image files
      const imageFiles = filePaths.filter((filePath) => {
        if (!fs.existsSync(filePath)) return false;
        const ext = path.extname(filePath).toLowerCase();
        return SUPPORTED_IMAGE_EXTENSIONS.includes(ext);
      });

      return imageFiles;
    } catch (error) {
      console.error('Error reading clipboard file paths:', error);
      return [];
    }
  });
};
