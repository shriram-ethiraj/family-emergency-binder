Family Emergency Binder Creator
================================

This is a portable, local application. It needs no installer, account, server,
or internet connection. Use it only on a computer and browser you trust.

Getting started
---------------

1. Keep this entire extracted folder together. Do not move the HTML file away
   from assets/ or templates/.
2. Open family-emergency-binder.html in a current Chrome, Edge, or compatible
   Chromium browser.
3. When prompted, choose this package's templates folder.
4. Open an existing encrypted .febvault, or create and save a new one.
5. Enter the vault password, then choose or create a profile.
6. Create a document, generate its password-protected PDF, and print or save it.
7. Wait for the application to show Saved before closing the browser, copying
   the vault, or ejecting removable storage.

Vault safety
------------

Store the recovery key separately from the password and every vault copy. Keep
more than one current backup. Do not edit the same vault concurrently in
multiple windows or on multiple computers.

The application folder, templates, and encrypted vault can be kept together on
an encrypted pen drive. Drive encryption adds protection while the device is
locked, but it cannot make an untrusted computer safe while the vault is open.

Chrome, Edge, and compatible Chromium browsers update the selected vault in
place. Firefox and Safari use compatibility mode and download a new encrypted
copy after changes; always retain the newest downloaded vault.

Custom templates
----------------

Copy custom JSON files anywhere inside templates/. Close and reopen the app,
then choose the templates folder again. Templates are read-only and remain
local.

Format, examples, validation rules, and an AI prompt:
https://github.com/shriram-ethiraj/family-emergency-binder/blob/main/docs/custom-templates.md
