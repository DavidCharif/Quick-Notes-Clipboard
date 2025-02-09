# Quick Notes Clipboard Chrome Extension

A secure and efficient Chrome extension for storing and managing encrypted text snippets, code blocks, and frequently used content.

## Features

- 🔒 Secure local storage with AES-GCM encryption
- 📝 Save and organize text snippets by categories
- 🔍 Quick search functionality
- 📋 One-click copy to clipboard
- 🎯 Right-click context menu integration
- 🎨 Clean and modern user interface
- 🏷️ Category-based organization (SQL, URLs, Code Snippets, Commands)
- 🔄 Automatic URL detection
- ⌨️ Keyboard shortcuts support

## Installation

### For Development
1. Clone this repository:
   ```bash
   git clone [your-repository-url]
   cd quick-notes-clipboard
   ```
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right corner
4. Click "Load unpacked" and select this directory

### From Chrome Web Store
1. Visit our Chrome Web Store page [link-to-be-added]
2. Click "Add to Chrome"
3. Follow the installation prompts

## Usage

### Basic Operations
1. Click the extension icon in your Chrome toolbar
2. Enter text in the input field
3. Select a category (SQL, URL, Code Snippet, Command, or Other)
4. Click "Save" or press Enter

### Context Menu
1. Select any text on a webpage
2. Right-click to open the context menu
3. Choose "Save to Quick Notes" and select a category

### Keyboard Shortcuts
- `Ctrl/Cmd + Enter`: Save note
- `Ctrl/Cmd + F`: Focus search
- `Esc`: Clear input/search

## Security

- All notes are encrypted using AES-GCM encryption
- Data is stored locally on your device
- No external servers or data transmission
- Encryption keys are securely stored in Chrome's local storage

## Privacy

See our [Privacy Policy](./PRIVACY.md) for detailed information about:
- Data collection and usage
- Storage practices
- User rights
- Security measures

## Development

### Project Structure
```
quick-notes-clipboard/
├── manifest.json      # Extension configuration
├── popup.html        # Main extension interface
├── popup.js         # Main functionality
├── background.js    # Background processes
├── options.js      # Settings functionality
└── assets/         # Icons and images
```

### Building from Source
1. Make any desired code modifications
2. Test thoroughly using Chrome's developer mode
3. Package the extension:
   - Zip all necessary files
   - Ensure manifest.json is at the root level

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## Support

If you encounter any issues or have questions:
1. Check our [FAQ](./FAQ.md)
2. Open an issue in the GitHub repository
3. Contact support at [your-support-email]

## License

This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details

## Version History

- 1.0.0 - Initial release
  - Basic note-taking functionality
  - Category organization
  - Encryption implementation
