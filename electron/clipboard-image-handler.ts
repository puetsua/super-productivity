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
 * @electron-only This function is only available in the Electron main process.
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
    async (
      _,
      args: { basePath: string; fileName: string; base64Data: string; mimeType: string },
    ) => {
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

  // Copy image file from clipboard to clipboard-images directory
  ipcMain.handle(
    IPC.CLIPBOARD_COPY_IMAGE_FILE,
    async (_, args: { basePath: string; filePath: string }) => {
      try {
        const { basePath, filePath } = args;
        ensureDir(basePath);

        // Generate unique ID
        const id = Date.now().toString(36) + Math.random().toString(36).substring(2);
        const ext = path.extname(filePath).toLowerCase();
        const destFileName = `${id}${ext}`;
        const destPath = path.join(basePath, destFileName);

        // Copy the file
        fs.copyFileSync(filePath, destPath);

        // Get file stats
        const stats = fs.statSync(destPath);
        const mimeType = getMimeFromExt(ext);

        return {
          id,
          mimeType,
          size: stats.size,
          createdAt: Date.now(),
        };
      } catch (error) {
        console.error('Error copying clipboard image file:', error);
        return null;
      }
    },
  );

  // Read image directly from clipboard
  ipcMain.handle(IPC.CLIPBOARD_READ_IMAGE, async (_, args: { basePath: string }) => {
    try {
      const image = clipboard.readImage();

      if (image.isEmpty()) {
        return null;
      }

      const { basePath } = args;
      ensureDir(basePath);

      // Generate unique ID
      const id = Date.now().toString(36) + Math.random().toString(36).substring(2);
      const fileName = `${id}.png`;
      const filePath = path.join(basePath, fileName);

      // Save as PNG
      const pngBuffer = image.toPNG();
      fs.writeFileSync(filePath, new Uint8Array(pngBuffer));

      const stats = fs.statSync(filePath);

      return {
        id,
        mimeType: 'image/png',
        size: stats.size,
        createdAt: Date.now(),
      };
    } catch (error) {
      console.error('[CLIPBOARD] Error reading image from clipboard:', error);
      return null;
    }
  });

  ipcMain.handle(IPC.CLIPBOARD_GET_FILE_PATHS, async () => {
    try {
      const filePaths: string[] = [];

      // Note: Electron's clipboard API on Windows doesn't reliably read file paths
      // when files are copied. clipboard.readImage() is used as fallback.

      // Try reading plain text (sometimes contains file paths)
      const plainText = clipboard.readText();
      if (plainText && plainText.startsWith('file://')) {
        const lines = plainText.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('file://')) {
            let filePath = trimmed.substring(7);
            if (process.platform === 'win32' && filePath.startsWith('/')) {
              filePath = filePath.substring(1);
            }
            filePath = decodeURIComponent(filePath);
            if (process.platform === 'win32') {
              filePath = filePath.replace(/\//g, '\\');
            }
            filePaths.push(filePath);
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
      console.error('[CLIPBOARD] Error reading clipboard file paths:', error);
      return [];
    }
  });
};
