/**
 * Original starter guides. They are general, qualified advice with no invented specifications, prices or product
 * claims. They are imported as DRAFTS flagged "needs review": a person at Fixit must read each one and confirm it
 * is correct for their shop before publishing.
 */
export interface StarterArticle {
  slug: string;
  title: string;
  excerpt: string;
  metaDescription: string;
  body: string;
}

export const STARTER_ARTICLES: StarterArticle[] = [
  {
    slug: "how-to-choose-the-right-phone-charger",
    title: "How to choose the right charger for your phone",
    excerpt: "Connector, wattage and fast-charging standards explained simply, so you buy a charger that actually suits your phone.",
    metaDescription: "A simple guide to choosing a phone charger: the right connector, how wattage works, fast-charging standards, and what to check before you buy.",
    body: `
Buying a charger sounds easy until you see the choices. This guide explains the few things that matter.

## 1. Start with your phone, not the charger
Look in your phone's manual, its box, or the manufacturer's specification page for the charging information. That tells you the connector and the fastest charging your phone supports. If you cannot find it, ask us and we will help you work it out.

## 2. Check the connector
Most current phones use **USB-C**. Some iPhones use **Lightning**, and some older or budget phones use **micro-USB**. The connector on the cable must match the port on your phone.

## 3. Understand wattage
Wattage (W) is how much power a charger can supply. A charger that offers *more* power than your phone needs is normally fine, because the phone only takes what it is built to accept. A charger that offers *less* will simply charge more slowly.

## 4. Fast-charging standards
Different phones use different fast-charging methods, such as USB Power Delivery or brand-specific systems. If the charger and phone do not share a method, they usually fall back to slower, basic charging. Check which one your phone supports before paying extra for a "fast" charger.

## 5. Do not forget the cable
A poor cable can slow charging or fail early, even with a good charger. Use a cable that is meant for your phone's charging speed.

## 6. Be careful with very cheap, unmarked chargers
Look for a charger with clear markings and a seller who can tell you what it is. Stop using any charger or cable that gets very hot, smells, or is damaged.

## Not sure?
Send us your phone model on [WhatsApp](/contact) and we will tell you what we have that suits it, or browse the [shop](/shop).
`,
  },
  {
    slug: "how-to-find-a-phone-case-that-fits",
    title: "How to find a phone case that really fits your phone",
    excerpt: "Why the exact model name matters, where to find it on your phone, and what to check before buying a case.",
    metaDescription: "How to identify your exact phone model and choose a compatible case: where to find the model name, what to check, and common mistakes.",
    body: `
A case that is almost the right size is the wrong case. Here is how to avoid that.

## 1. Find your exact model name
Open **Settings**, then **About phone** (on iPhone: **Settings > General > About**). Note the full model name. Similar names can be different phones, so write down every word, for example any letters or numbers after the main name.

## 2. Do not rely on screen size
Two phones with the same screen size can have different bodies, camera layouts and button positions.

## 3. Check the camera and button cut-outs
A good case leaves the camera, flash, charging port, speaker and buttons uncovered and easy to use. Compare the case photos with your phone.

## 4. Use the shop's compatibility list
On our product pages, the **Compatible devices** list shows which phones an item has been listed for. If your model is not listed, do not assume it fits. Ask us first.

## 5. Think about what you need
A slim case adds little bulk. A thicker case offers more drop protection. A case does not make a phone unbreakable.

## Need help?
Bring your phone in, or message us your model through the [contact page](/contact). You can also search our [shop](/shop) by phone model.
`,
  },
  {
    slug: "signs-your-phone-battery-may-be-failing",
    title: "Common signs your phone battery may be failing",
    excerpt: "What a tired battery tends to look like, what else can cause the same symptoms, and when to stop using the phone.",
    metaDescription: "Common signs of a failing phone battery, other causes to rule out first, and safety warning signs that mean you should stop using the phone.",
    body: `
Phone batteries wear out with use. These are common signs, and what to check.

## Signs a battery may be wearing out
- The phone runs out of charge much faster than it used to.
- The phone switches off even though it showed some charge left.
- The phone gets noticeably warm during normal use or charging.
- Charging takes a very long time, or the percentage jumps around.

## These can have other causes
The same symptoms can come from apps running in the background, a software problem, a worn cable or charger, or a dirty charging port. Before blaming the battery, restart the phone, try a different cable and charger you trust, and check which apps use the most battery.

## Safety: stop using the phone if the battery looks swollen
If the back of the phone is lifting, the screen is bulging, or the phone no longer sits flat, the battery may be swollen. Stop charging and using the phone, do not press on it or try to open it, keep it away from heat, and have it checked by a repair shop as soon as you can.

## Getting it looked at
A technician needs to look at the phone to say whether the battery is the problem. We cannot diagnose from a description alone, and we do not promise a result before we have checked it. You can [send a repair request](/repairs) and we will review it and contact you.
`,
  },
  {
    slug: "what-to-check-before-buying-a-power-bank",
    title: "What to check before buying a power bank",
    excerpt: "Capacity, ports, speed and safety: a short checklist for choosing a power bank you will be happy with.",
    metaDescription: "A practical checklist for buying a power bank: capacity in mAh, usable capacity, output ports and speed, size, and safety tips.",
    body: `
A power bank is only useful if it suits your phone and your day. Use this checklist.

## 1. Capacity (mAh)
Capacity is shown in mAh. Bigger numbers store more energy but are heavier and larger. The number on the label is not what you can actually use: some energy is lost when the power bank charges your phone, so the usable amount is lower than the label. Do not expect to get exactly the labelled amount.

## 2. Ports and cables
Check which ports it has (USB-C, USB-A) and whether it can charge more than one device at once. Make sure you have a cable that fits your phone.

## 3. Charging speed
Look at the output rating. If your phone supports faster charging, check that the power bank supports a matching method. If it does not, the phone will charge more slowly.

## 4. Size and weight
Think about where you will carry it. A large power bank you leave at home does not help.

## 5. Information from the seller
Prefer a seller who lists clear specifications and can answer questions. Be careful with listings that give huge capacities with no details.

## 6. Safety and travel
Stop using a power bank that is damaged, swollen, or unusually hot. If you travel by air, check your airline's rules for carrying power banks before you fly.

## Looking for one?
See what we have in the [shop](/shop), or ask us on the [contact page](/contact).
`,
  },
];
