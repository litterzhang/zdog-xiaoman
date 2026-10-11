# Xiaoman App Icon, Version 1

Generated on 2026-10-05 using the user-requested XDOG native image CLI, not an OpenAI SDK runner or a code-drawn substitute.

## Design

A single centered swaddled-baby mark on an opaque white background. Cool slate blue-gray and charcoal only. No text, green, warm colors, decorative props, gradients, or shadows. The design follows the project's minimal, cool-neutral direction.

## Files

- `prompt.txt`: exact prompt used for the successful generation.
- `image-c7fa541c0a3f4b8f9ba1e00ff27f123d-1.jpg`: original 1024 x 1024 provider output, preserved without alteration.
- `generation.json`: provider/model, parameters, usage, source/export hashes, and postprocessing details. Contains no credentials.
- `prompt-sandbox-attempt.txt`: prompt for the earlier restricted-network attempt, which timed out without saving an image.
- `../../../src/assets/brand/app-icon-master-v1.png`: 1024 x 1024 PNG master converted from the original output.
- `../../../src/assets/brand/app-icon-v1.png`: 512 x 512 PNG export for normal app-brand usage.

The PNG exports preserve the generated design. Postprocessing only converts JPEG to opaque RGB PNG and resizes the smaller export with Pillow LANCZOS. No elements were drawn, recolored, or retouched programmatically. The original JPEG has small near-white compression artifacts; these are preserved rather than retouched. Export verification and the 512px conversion use the current project's isolated uv dependency overlay (`uv run --project server --no-sync --offline --with pillow`), without importing another workspace's virtual environment or adding Pillow to the Flask runtime dependencies.

## Generation Command

Run from `/home/zhang/workspace/xdog` in an interactive zsh shell, where the user's `proxy_on` function is defined:

```sh
proxy_on
uv run --no-sync xdog-ai image antigravity gemini-3.1-flash-image \
  "$(cat /home/zhang/workspace/zdog-xiaoman/client/design/generated/app-icon-v1/prompt.txt)" \
  --aspect-ratio 1:1 --image-size 1K \
  --output-dir /home/zhang/workspace/zdog-xiaoman/client/design/generated/app-icon-v1 \
  --json
```

The successful invocation used the existing XDOG provider authentication and the user's HTTP proxy. No OpenAI API key was required. The CLI's uniquely named output avoids overwriting prior artwork. Generation consumes provider quota; do not automatically retry failed or timed-out requests.

## Integration Boundary

These assets are ready for app-brand use. Existing page layouts and native tab/category icons were not replaced. Nothing was uploaded to WeChat, submitted for review, or published. Selecting this image as the platform app avatar is a separate explicit action.
