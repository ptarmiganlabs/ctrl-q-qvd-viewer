# GitHub Copilot Instructions for qvd4vscode

## Project Overview

This is a Visual Studio Code extension for previewing QVD (QlikView Data) files directly within VS Code. QVD files are binary files used by QlikView and Qlik Sense for data storage.

## Tech Stack

- **Type**: VS Code Extension
- **Language**: TypeScript/JavaScript (expected for VS Code extensions)
- **Target Platform**: Visual Studio Code
- **File Format**: QVD (QlikView Data files)

## Coding Standards

### General Guidelines

- Follow VS Code extension development best practices
- Use TypeScript for type safety when adding new code
- Maintain clean, readable, and well-documented code
- Keep dependencies minimal and up-to-date

### Code Style

- Use consistent indentation (2 or 4 spaces based on existing files)
- Follow JavaScript/TypeScript naming conventions:
  - camelCase for variables and functions
  - PascalCase for classes and types
  - UPPER_CASE for constants
- Add JSDoc comments for public APIs and complex functions

### VS Code Extension Specific

- Follow the VS Code extension API guidelines
- Register commands, views, and providers properly in package.json
- Handle extension activation and deactivation correctly
- Provide meaningful error messages to users
- Respect VS Code's theming and UI guidelines

## Testing

- Test the extension with various QVD file formats and sizes
- Verify compatibility with different VS Code versions
- Test edge cases like corrupted or invalid QVD files
- Manual testing in VS Code is essential for UI/UX validation

## Development Workflow

- Use semantic versioning for releases
- Keep the README.md updated with features and usage instructions
- Document any breaking changes in release notes
- Ensure the extension works on Windows, macOS, and Linux

## Dependencies

- Keep dependencies minimal to reduce extension size
- Use Renovate for automated dependency updates (already configured)
- Review security advisories for any added dependencies

## File Structure

When adding new features:
- Place source code in a `src/` directory
- Keep extension manifest in `package.json`
- Store assets in appropriate directories (e.g., `resources/`, `media/`)
- Add tests in a `test/` directory

## QVD File Handling

- Handle QVD binary format carefully
- Implement proper error handling for file parsing
- Consider memory efficiency for large QVD files
- Display data in a user-friendly, tabular format
- Support sorting, filtering, and searching within preview when applicable

## Performance Considerations

- Lazy load large QVD files when possible
- Implement pagination or virtualization for large datasets
- Avoid blocking the VS Code UI thread
- Profile and optimize any performance-critical code

## Security

- Validate QVD file structure before parsing
- Handle untrusted or malformed files safely
- Don't execute arbitrary code from QVD files
- Follow security best practices for file I/O operations
