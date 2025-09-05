# ChatGPT Userscript

This is a userscript to be used on Tampermonkey, Violentmonkey, Greasemonkey, etc.

## About the project

This ChatGPT userscript adds two independent features:

- A floating prompts navigator listing user messages from the current conversation; clicking an item scrolls to that prompt.
- Sidebar accordions for the left menu: one for the existing "GPTs" section and another for a new "Projects" section. Both are collapsed by default and use a rotating chevron.

Implementation notes:
- The prompts navigator UI is encapsulated in a Shadow DOM to avoid style clashes.
- The sidebar accordions are implemented in a self-contained section with shared utilities, and a dedicated scanner/observer that avoids coupling with the prompts navigator.
