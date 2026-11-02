# User Guide

1. Start Redis and the application using the README commands.
2. Open http://localhost:5173.
3. Sign in with any demo account and `demo-password`.
4. Select an available room from the left panel.
5. Type a message and press Enter. Shift+Enter adds a line.
6. Use the status indicator to see the active node and connection state.
7. If a node stops, wait for the client to switch to the other node. It should rejoin authorized rooms without another login.

Room access is enforced by the server. A member cannot enter the moderators room. Messages are temporary and disappear when the application page or server session is refreshed/restarted.
