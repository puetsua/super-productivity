# Clipboard Image Paste Feature for Markdown Editor

Add a feature to allow users to paste images from clipboard into the markdown editor.

---

## Platform-Specific Implementation

### Electron (Desktop)

Two clipboard scenarios to handle:

1. **Image content in clipboard** (e.g., screenshot, copied image data):

   - Create an image file in the local user data folder (via `getUserDataPath()`)
   - Reference the image using `file://` protocol path

2. **Image file in clipboard** (e.g., copied file from explorer):
   - Extract the file path directly from clipboard
   - Reference the image using the local file path

**Storage location:** `{userData}/clipboard-images/` directory.

---

### Web Application (Browser)

Since Super Productivity does **not have a backend server** to store uploaded images, here are some considerations:

- When pasted, store them in **IndexedDB**.
- Use a **directive-based approach** to resolve image URLs at render time:
  - Link images with custom URL format: `indexeddb://clipboard-images/{unique-id}`
  - When markdown is rendered, a directive detects `indexeddb://` URLs
  - The directive loads the image blob from IndexedDB and creates a `blob:` URL
  - The `blob:` URL is set as the actual image `src`.
- Size limitations should be enforced (e.g., max 2MB per image).

**Note:** Service Workers cannot intercept custom protocols like `indexeddb://`. They only handle `http://` and `https://` requests. The directive-based approach provides reliable cross-browser support.

**Browser support required:**

- Google Chrome
- Mozilla Firefox
- Apple Safari
- Microsoft Edge
- Opera

---

### Extra Considerations

In markdown, we should support image sizing syntax like `![pasted image](indexeddb://clipboard-images/{unique-id} =200x150)` to allow users to specify image dimensions.

Use PNG to store a image if pasted image data does not have a specific format.

## Implementation Tasks

### Phase 1: Core Clipboard Handling

- [x] Detect image paste events in markdown editor
- [x] Extract image data from clipboard (both image content and file)
- [x] Platform detection (Electron vs Web)
- [x] Generate unique IDs for pasted images (timestamp + random string)

### Phase 2: Electron Implementation

- [ ] Add settings option for clipboard images storage location (optional)
- [x] Create `clipboard-images` directory in user data folder
- [x] Save pasted images with unique filenames
- [x] Insert markdown image reference with `indexeddb://` URL (resolved to `file://` at render)
- [x] Handle clipboard file references

### Phase 3: Web Implementation - Storage Layer

- [x] Create IndexedDB store for clipboard images (key: unique-id, value: Blob)
- [x] Implement image CRUD operations (create, read, delete, list)
- [x] Add image size validation (max 2MB per image)
- [ ] Add an image storage management UI for users to view/delete stored images (optional)

### Phase 4: Web Implementation - URL Resolution

- [x] Create directive to detect `indexeddb://` URLs in rendered markdown
- [x] Load image blob from IndexedDB when `indexeddb://` URL is detected
- [x] Create `blob:` URL and set as image src
- [x] Handle missing images gracefully (error class added)

### Phase 5: Markdown Editor Integration

- [x] Extend markdown renderer to support `indexeddb://` protocol in image src
- [x] Support image sizing syntax: `![alt](url =WIDTHxHEIGHT)`
- [ ] Add image resize handles in editor (optional enhancement)
- [x] Preview support for pasted images

### Phase 6: Polish & Testing

- [ ] Add progress indicator for large images
- [x] Error handling and user notifications
- [ ] Unit tests for clipboard handling and IndexedDB storage
- [ ] Unit tests for URL resolution directive
- [ ] E2E tests for paste functionality (Electron and Web)
