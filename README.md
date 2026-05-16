Crpto Chat — Local Crypto Proof Chat Demo

Overview
--------
Crpto Chat is a small, browser-native demo that simulates an SMS-style sender/receiver chat and attaches cryptographic proof metadata to each message. It is designed as an educational showcase of the Web Crypto API (AES, RSA, RSA-PSS signatures), JWT-style authentication simulation, and a lightweight localStorage "database" for activity/proof inspection.

Key features
------------
- Split-screen sender / receiver UI (responsive) with scrollable chat history.
- Local cryptographic pipeline: AES encryption for message transport, RSA keys for signing, RSA-PSS signature verification, and JWT-like tokens for session proofs.
- Activity panel showing message metadata (ciphertext, hash, keys, proofs) and clickable verification entries.
- Deep dark, elegant UI with mobile-first responsive layout.
- Fully client-side: no network required — everything runs in the browser and stores data in localStorage.

Files
-----
- index.html — main UI and layout
- style.css — styling and responsive rules
- script.js — application logic, crypto workflow, storage, rendering

Requirements
------------
- Modern browser with Web Crypto API support (Chrome, Edge, Firefox, Safari recent versions).
- No server required to run; optional static server recommended for consistent MIME handling.

Quick start
-----------
Open the app in a browser:

- Double-click `index.html` to open in the browser (file://). Some browsers restrict certain features for local files — if you see issues, use a simple static server below.

Serve with Python (recommended) from the project folder:

```bash
# Python 3.x
python -m http.server 8000
# then open http://localhost:8000 in your browser
```

Or with Node.js `http-server` (if installed):

```bash
npx http-server -c-1
```

Usage notes
-----------
- Use the left pane to act as the "sender" and the right pane to act as the "receiver". Messages are encrypted, signed, and stored locally when "Sent".
- Open the Activity panel to inspect per-message proofs: ciphertext, hashes, keys (public), and signature verification details.
- Click an activity item to view and re-run verification checks stored with the message.

Development notes
-----------------
- `script.js` contains the core Web Crypto usage: key generation, AES-GCM encryption/decryption, RSA-OAEP/RSA-PSS operations, and simple JWT-like token creation.
- The UI is plain HTML/CSS — modify `style.css` to tune the color palette or responsive breakpoints.
- To reset app state, clear the browser's `localStorage` for the site.

Security and disclaimer
-----------------------
- This project is an educational demo, not production-ready cryptographic software. Do not use it to protect real sensitive data.
- Keys and proofs are stored locally in browser storage and should not be assumed secure beyond the demo scope.

Next steps
----------
- Add optional export/import for activity proofs (JSON).
- Add unit tests for cryptographic functions and a small e2e demo harness.

Questions or changes
--------------------
If you'd like a different README tone (short/long), screenshots embedded, or automated export examples, tell me which and I will update `README.md` accordingly.
