import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { ensureOwnerLogin } from "./helpers";

test.describe.configure({ mode: "serial" });

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const file = (name: string) => ({ name, mimeType: "image/png", buffer: PNG });
const stamp = Date.now();
const NAME = `Media Item ${stamp}`;

test("360-degree viewer: turn by keyboard, buttons and drag; back to photos; only where frames exist", async ({ page, request }) => {
  await request.post("/api/dev/seed");
  await page.goto("/product/demo-stand-titanium");
  await expect(page.getByRole("button", { name: "360° view" })).toHaveCount(0); // no frames for this finish: no button, no empty viewer

  await page.goto("/product/demo-stand-silver");
  await page.getByRole("button", { name: "360° view" }).click();
  const stage = page.getByRole("slider", { name: /Turn .* around/ });
  const frame = page.getByTestId("spin-frame");
  await expect(stage).toBeVisible();
  await expect(frame).toHaveAttribute("src", /spin-01\.svg/);
  await expect(stage).toHaveAttribute("aria-valuenow", "1");
  await expect(stage).toHaveAttribute("aria-valuemax", "12");

  await stage.focus();
  await page.keyboard.press("ArrowRight");
  await expect(frame).toHaveAttribute("src", /spin-02\.svg/);
  await expect(stage).toHaveAttribute("aria-valuetext", "View 2 of 12");
  await page.keyboard.press("End");
  await expect(frame).toHaveAttribute("src", /spin-12\.svg/);
  await page.keyboard.press("ArrowRight"); // wraps round like a real turntable
  await expect(frame).toHaveAttribute("src", /spin-01\.svg/);
  await page.keyboard.press("ArrowLeft");
  await expect(frame).toHaveAttribute("src", /spin-12\.svg/);

  await page.getByRole("button", { name: "Turn right" }).click();
  await expect(frame).toHaveAttribute("src", /spin-01\.svg/);
  await page.getByRole("button", { name: "Turn left" }).click();
  await page.getByRole("button", { name: "Turn left" }).click();
  await expect(frame).toHaveAttribute("src", /spin-11\.svg/);

  const box = (await stage.boundingBox())!;
  await page.keyboard.press("Home");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - box.width / 3, box.y + box.height / 2, { steps: 6 });
  await page.mouse.up();
  await expect(frame).not.toHaveAttribute("src", /spin-01\.svg/); // dragging turned it

  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([]);

  await page.getByRole("button", { name: "Back to photos" }).click();
  await expect(stage).toHaveCount(0);
  await expect(page.getByRole("button", { name: "360° view" })).toBeVisible();

  // Choosing another finish while turning leaves the viewer, because the frames belong to one finish.
  await page.getByRole("button", { name: "360° view" }).click();
  await page.getByRole("radio", { name: /Titanium Grey/ }).click();
  await expect(stage).toHaveCount(0);
  await expect(page.getByRole("button", { name: "360° view" })).toHaveCount(0);
});

test("admin upload: signed ticket, files go to Cloudinary, links land in the form, and the storefront serves optimised images", async ({ page }) => {
  await ensureOwnerLogin(page);
  const sent: string[] = [];
  let n = 0;
  await page.route("https://api.cloudinary.com/**", async (route) => {
    sent.push(route.request().postData() ?? "");
    const id = ++n;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ secure_url: `https://res.cloudinary.com/e2e-cloud/image/upload/v1/fixit/p/f${String(id).padStart(2, "0")}.png` }) });
  });
  await page.goto("/admin/products/new");
  await page.getByLabel("Product name").fill(NAME);
  await page.getByLabel("Price (Rs.)", { exact: true }).fill("1500");
  await page.getByLabel("Stock quantity").fill("5");
  await page.getByLabel(/Published/).check();

  // a wrong file type is refused before anything is sent
  await page.locator("#images-file").setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") });
  await expect(page.getByText(/is not a JPG, PNG or WebP under 10 MB/)).toBeVisible();
  expect(sent).toHaveLength(0);

  await page.locator("#images-file").setInputFiles([file("front.png"), file("back.png")]);
  await expect(page.getByText("Added 2 photos")).toBeVisible();
  const photos = await page.locator("#images").inputValue();
  expect(photos.split("\n")).toHaveLength(2);
  expect(photos).toContain("https://res.cloudinary.com/e2e-cloud/image/upload/v1/fixit/p/f01.png|");

  // the browser got a signature, never the account secret
  expect(sent[0]).toContain("signature");
  expect(sent[0]).toContain("allowed_formats");
  expect(sent.join("")).not.toContain("e2e-cloudinary-secret");

  // turntable frames: files are taken in natural filename order (2 before 10)
  const frames = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"].map((x) => file(`${x}.png`));
  await page.locator("#spin-file").setInputFiles([...frames].reverse());
  await expect(page.getByText("Added 10 photos")).toBeVisible();
  expect((await page.locator("#spin").inputValue()).split("\n")).toHaveLength(10);

  // fewer than 8 frames is refused with a plain message and the form keeps what was typed
  const all = (await page.locator("#spin").inputValue()).split("\n");
  await page.locator("#spin").fill(all.slice(0, 3).join("\n"));
  await page.getByRole("button", { name: "Save product" }).click();
  await expect(page.getByText(/needs at least 8 frames/)).toBeVisible();
  await expect(page.getByLabel("Product name")).toHaveValue(NAME);

  await page.locator("#spin").fill(all.join("\n"));
  await page.getByRole("button", { name: "Save product" }).click();
  await expect(page.getByText("Product saved.")).toBeVisible();

  const slug = `media-item-${stamp}`;
  await page.goto(`/product/${slug}`);
  await expect(page.getByRole("button", { name: "360° view" })).toBeVisible();
  const src = await page.locator("main img, .stage img").first().getAttribute("src");
  expect(src).toContain("/image/upload/f_auto,q_auto,w_1000/v1/fixit/p/f01.png");

  // saving again keeps both the photos and the frames
  await page.goto("/admin/products");
  await page.getByRole("link", { name: NAME }).click();
  await expect(page.locator("#spin")).toHaveValue(all.join("\n"));
  await expect(page.locator("#images")).toHaveValue(photos.replaceAll("|", `|${NAME}`)); // a blank description is saved as the product name
});
