# Veyra Platform — Usage Metering

## Overview

Veyra Platform measures cloud AI usage across multiple dimensions to enable accurate billing and entitlement enforcement.

## Usage Dimensions

| Dimension | Unit | Description |
|-----------|------|-------------|
| input_tokens | tokens | Input text tokens processed |
| output_tokens | tokens | Output text tokens generated |
| audio_seconds | seconds | Audio duration processed |
| tts_characters | characters | Text-to-speech characters |
| vision_images | images | Vision images processed |
| image_generations | count | Image generation count |
| screen_understanding | count | Screen understanding operations |

## Usage Tracking

All cloud AI usage is recorded in the `ai_usage_log` table with:
- User ID
- Device ID (optional)
- Provider ID
- Model ID
- Capability
- Tokens input/output
- Audio seconds
- TTS characters
- Vision images
- Cost in cents
- Status (success/failure/timeout)
- Error message (if failed)
- Timestamp

## Usage Reporting

Usage can be queried per user, per model, per capability, or per time period. This enables:
- Per-user usage reports
- Per-model cost analysis
- Per-capability usage breakdown
- Billing reconciliation

## Cloud Credit Controls

Before executing a cloud AI request, the platform:
1. Verifies user entitlement for `cloudInference` capability
2. Checks available credits
3. Reserves credits for estimated cost
4. Invokes provider adapter
5. Records usage
6. Settles or releases reservation

If credits are insufficient, the request is rejected before execution.

## Usage Source Tracking

Every usage record identifies the source of measurement:
- Provider-reported usage (from AI provider API)
- Estimated usage (when provider doesn't report)
- Client-reported usage is NEVER trusted without server-side validation

## SDK

Usage metering is handled internally by the cloud AI gateway. The SDK does not expose direct usage metering methods—usage is recorded automatically when cloud AI is invoked.
