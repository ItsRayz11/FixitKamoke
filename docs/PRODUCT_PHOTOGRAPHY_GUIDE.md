# Product photography and finishes guide

The product image is a large part of buying confidence (V2 §6). The store never invents or generates product pictures. Every photo comes from you, uploaded in Admin → Products (Cloudinary) or pasted as an https link.

## What to photograph
For each item, shoot the **real product you sell**, and keep these identical across the whole catalogue:
- Camera angle and distance (suggested: front view, 3/4 view, port/connector close-up, what is in the box).
- Lighting direction (soft light from the upper left; no harsh flash).
- Background: plain white or very light grey. Square or 4:5 crop; minimum 1200 × 1200 px; JPEG/WebP under 300 KB after compression.
- Everything included in the pack and nothing that is not (no accessories that are not sold).

## Finishes (colours)
- Each finish is its own product in Admin → Products: same product name, the same **Finish group** text, a different **Finish name** (for example "Titanium Grey"), the swatch **colour** matched to the real item, its own SKU, stock, price and **photos of that exact finish**.
- Choosing a finish on the page swaps the photos, price and stock. If a finish has no photos yet the page says so rather than showing another colour.
- Tick "Customer must choose a finish" when picking the wrong colour would matter; the Add to cart button then guides the customer to choose first.
- Do not add a finish you do not hold. Do not reuse one colour's photo for another.

## Alt text
Write after the `|` on each image line, for example `https://…/front.jpg|Front view, Titanium Grey`. Describe what is visible.

## 360° turntable view
Built. It uses **real photos** of the real product on a turntable (24 to 36 frames, same camera position and light), never generated images. Shooting steps and how to add the frames are in [GO_LIVE_GUIDE.md](GO_LIVE_GUIDE.md) section 5. For cables, cases and chargers a gallery of 3 to 4 angles is cheaper and loads faster; use the turntable for products where the shape matters (stands, cases, chargers).

## Uploading
With Cloudinary set up (GO_LIVE_GUIDE section 3), Admin -> Products has an upload button, and the shop serves a right-sized modern-format copy automatically.

## Placeholder pictures in demo mode
The `public/demo/*.svg` files are clearly labelled "DEMO IMAGE – not a real photograph". They exist only so the finish switching can be tested. They are never shown when the shop is not in demo mode unless a product uses them.
