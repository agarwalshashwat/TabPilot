# YouTube Playbook

## Goal

Improve reliability for search-and-play tasks while keeping core automation generic.

## Runtime data source

The runtime rule source is [src/background/platforms/data/playbooks.json](../../src/background/platforms/data/playbooks.json) under id `youtube`.

## Known quirks

- Result containers vary (`ytd-video-renderer`, `ytd-rich-item-renderer`, and occasional alternates).
- Watch pages can appear before video playback settles, causing transient false negatives.
- Query intent in user prompts may include extra words; semantic matching should focus on meaningful terms.

## Verification expectations

- Correct watch page opened.
- Playback started or progressing.
- Video title/channel semantically match requested target phrase.

## Retry guidance

- If wrong video opens, force a fresh search flow instead of repeating result selectors on a watch page.
- Keep retries on the same reusable tab when possible.
