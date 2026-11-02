# npm-gpt

Terminal AI client for PenguinGPT.

## Install

```powershell
npm install -g .
npm-gpt
```

## API

- https://penguingpt.gpgpg4445.workers.dev/v1/models
- https://penguingpt.gpgpg4445.workers.dev/v1/chat/completions
- https://penguingpt.gpgpg4445.workers.dev/v1/images/generations

## Shortcuts

- Enter: Send
- Tab: Select model
- Up / Down: Navigate models or prompt history
- Left / Right: Switch Chat / Image
- Ctrl+G: Image Studio
- Ctrl+E: Chat mode
- Ctrl+O: Upload image
- Ctrl+M: Upload image (terminal dependent)
- Ctrl+S: Copy latest generated image to Downloads
- Ctrl+H: Conversation history
- Esc: Cancel / close
- Ctrl+C: Exit

History is stored in `chat-history.json`.
Generated images are stored in `generated`.
