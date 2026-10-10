# Doraemon Web v84.9 — controlled Vocemundi image rendering

This is a static-web-only update based on the already supplied v84.8 web bundle, preserving counter-marker support. No Doraemon server or database change is required.

Deploy this web bundle to the same static site as the current Doraemon web app. The `script.js` recognizes `[[VOCEMUNDI_IMAGE:v1:<base64url-json>]]` markers and renders a figure with an external image, caption, credit, licence, and a link to open the original image.

Security and size checks: the client only renders HTTPS URLs from `upload.wikimedia.org` or `*.vocemundi.com`, rejects credentials and unsupported/unlicensed markers, and requires the agent-reported byte count to be between 1 and 500,000 bytes. The agent separately validates the actual downloaded response size and MIME type before it creates the marker. Text remains escaped; arbitrary HTML inside forum posts is not executed. The image file remains hosted at its original source and is not stored in Doraemon.

The agent must only create image markers after verifying the image's own licence/credit. Vocemundi's text licence does not automatically include third-party photos.
