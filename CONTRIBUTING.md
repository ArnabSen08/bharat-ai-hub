# Contributing to Bharat AI Hub

Thank you for your interest in contributing to Bharat AI Hub! This document provides guidelines for contributing to the project.

## Code of Conduct

- Be respectful and inclusive
- Welcome newcomers and help them get started
- Focus on constructive feedback
- Respect differing viewpoints and experiences

## How to Contribute

### Reporting Bugs

1. Check if the bug has already been reported in Issues
2. If not, create a new issue with:
   - Clear title and description
   - Steps to reproduce
   - Expected vs actual behavior
   - Screenshots if applicable
   - Environment details (OS, browser, etc.)

### Suggesting Features

1. Check if the feature has been suggested
2. Create a new issue with:
   - Clear description of the feature
   - Use cases and benefits
   - Possible implementation approach

### Pull Requests

1. Fork the repository
2. Create a new branch (`git checkout -b feature/your-feature-name`)
3. Make your changes
4. Write or update tests
5. Ensure all tests pass
6. Commit your changes (`git commit -m 'Add some feature'`)
7. Push to the branch (`git push origin feature/your-feature-name`)
8. Open a Pull Request

### Coding Standards

#### JavaScript/Node.js
- Use ES6+ features
- Follow Airbnb style guide
- Use meaningful variable names
- Add comments for complex logic
- Keep functions small and focused

#### Python
- Follow PEP 8 style guide
- Use type hints
- Write docstrings for functions
- Keep functions under 50 lines

#### General
- Write self-documenting code
- Add unit tests for new features
- Update documentation
- Keep commits atomic and well-described

### Commit Messages

Follow conventional commits format:
```
type(scope): subject

body

footer
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes
- `refactor`: Code refactoring
- `test`: Test additions/changes
- `chore`: Build process or auxiliary tool changes

Example:
```
feat(healthcare): add prescription OCR feature

Implemented prescription text extraction using Amazon Textract.
Supports multiple image formats and languages.

Closes #123
```

### Testing

- Write unit tests for all new code
- Ensure test coverage > 80%
- Run tests before submitting PR: `npm test`
- Test on multiple environments if possible

### Documentation

- Update README.md if needed
- Add JSDoc comments for functions
- Update API documentation
- Add examples for new features

## Development Setup

1. Clone the repository
```bash
git clone https://github.com/YOUR_USERNAME/bharat-ai-hub.git
cd bharat-ai-hub
```

2. Install dependencies
```bash
npm install
```

3. Set up environment variables
```bash
cp .env.example .env
# Edit .env with your configuration
```

4. Run database migrations
```bash
npm run migrate
```

5. Start development server
```bash
npm run dev
```

## Project Structure

- `/src` - Source code
  - `/modules` - Feature modules
  - `/services` - Shared services
  - `/api` - API routes
  - `/utils` - Utility functions
- `/frontend` - Frontend applications
- `/infrastructure` - AWS CDK infrastructure
- `/tests` - Test files
- `/docs` - Documentation

## Module Development

When adding a new module:

1. Create module directory in `/src/modules`
2. Implement core functionality
3. Add API routes in `/src/api`
4. Write tests
5. Update documentation
6. Add to main app.js

## AWS Services Integration

When integrating new AWS services:

1. Add SDK dependency to package.json
2. Create service wrapper in `/src/services`
3. Add configuration to .env.example
4. Update infrastructure code
5. Document usage

## Questions?

- Open an issue for questions
- Join our community discussions
- Email: contact@bharataihub.com

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
