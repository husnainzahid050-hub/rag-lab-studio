import type { DocumentKind } from "../types";

export interface SampleDocument {
  id: string;
  name: string;
  kind: DocumentKind;
  text: string;
}

/** Fictional content written for this demo. "Harbor Light Coffee Co." is not a real company. */
export const SAMPLE_DOCUMENTS: SampleDocument[] = [
  {
    id: "sample-handbook",
    name: "employee-handbook.md",
    kind: "markdown",
    text: `# Harbor Light Coffee Co. — Employee Handbook

This handbook is sample content for RAG Lab Studio. Harbor Light Coffee Co. is a fictional company.

## Working hours

Our roastery operates Monday to Saturday. Standard shifts run from 7:00 to 15:30 with a 30-minute unpaid lunch break. Café staff work rotating shifts that are published every Thursday for the following week.

## Paid time off

Full-time employees receive 22 days of paid annual leave per calendar year, plus public holidays. Part-time employees receive leave in proportion to their contracted hours. Leave requests must be submitted at least 14 days in advance through the scheduling app. Up to five unused days can be carried over into the next year; any remaining days expire on 31 March.

## Sick leave

If you are unwell, notify your shift lead before the start of your shift. A doctor's note is required for absences longer than three consecutive working days.

## Remote work

Office roles such as accounting and marketing may work remotely up to two days per week with manager approval. Roastery and café roles require on-site presence because they involve operating equipment and serving customers.

## Staff benefits

Every employee receives a free 250 g bag of coffee each week and a 40% discount on merchandise. After six months of employment, staff can join the barista training programme, which covers espresso extraction, milk texturing and latte art.

## Safety

Heat-resistant gloves must be worn when handling the roaster drum or emptying the cooling tray. Report any burn, cut or equipment fault to your shift lead immediately and record it in the incident log.
`,
  },
  {
    id: "sample-returns",
    name: "returns-and-shipping.md",
    kind: "markdown",
    text: `# Returns and Shipping Policy

Sample content for RAG Lab Studio. Harbor Light Coffee Co. is fictional.

## Shipping

Orders placed before 13:00 on a working day are roasted and dispatched the same day. Standard delivery takes 2 to 4 working days. Express delivery arrives the next working day and costs 6.50 EUR. Shipping is free for orders over 40 EUR.

We ship whole beans by default. Ground coffee is available in three grind sizes: espresso, filter and French press.

## Returns

Unopened coffee and equipment can be returned within 30 days of delivery. Opened coffee cannot be returned unless it arrived damaged or was roasted incorrectly. To start a return, email support with your order number and a photo of the item.

## Refunds

Refunds are issued to the original payment method. Once we receive and inspect the returned item, the refund is processed within 5 to 7 business days. Original shipping costs are refunded only when the return is caused by our mistake.

## Damaged deliveries

If a parcel arrives damaged, keep the packaging and contact us within 48 hours. We will send a replacement at no cost or issue a full refund, whichever you prefer.

## Subscriptions

Coffee subscriptions can be paused or cancelled at any time before the next billing date. Changes made after the billing date apply to the following cycle.
`,
  },
  {
    id: "sample-brewing",
    name: "brewing-guide.txt",
    kind: "text",
    text: `HARBOR LIGHT BREWING GUIDE
(Sample content for RAG Lab Studio. Harbor Light Coffee Co. is fictional.)

Water. Use filtered water heated to between 92 and 96 degrees Celsius. Water that is too hot extracts bitter compounds, while water that is too cool leaves the coffee sour and thin.

Ratio. For filter coffee we recommend a brew ratio of 1:16, which means 15 grams of coffee for every 240 grams of water. For a stronger cup, move towards 1:15.

Grind size. Espresso needs a fine grind similar to table salt. Pour-over methods such as the V60 use a medium-fine grind. The French press needs a coarse grind so the metal filter can hold back the grounds.

Espresso. A standard double shot uses 18 grams of coffee and produces about 36 grams of liquid espresso in 25 to 30 seconds. If the shot runs faster than 20 seconds, grind finer; if it runs slower than 35 seconds, grind coarser.

French press. Steep the coffee for four minutes, then press the plunger slowly and serve immediately so the coffee does not over-extract.

Storage. Keep beans in an airtight container away from light and heat. Coffee tastes best between one and four weeks after the roast date. Do not store beans in the refrigerator, because moisture and odours damage the flavour.
`,
  },
  {
    id: "sample-maintenance",
    name: "equipment-maintenance.txt",
    kind: "text",
    text: `EQUIPMENT MAINTENANCE SCHEDULE
(Sample content for RAG Lab Studio. Harbor Light Coffee Co. is fictional.)

Daily tasks. Backflush each espresso group head with clean water at the end of every shift. Purge and wipe the steam wands after every drink. Empty and rinse the drip trays.

Weekly tasks. Backflush the group heads with detergent every Friday. Soak portafilters and baskets in a cleaning solution overnight. Clean the grinder burrs with grinder cleaning tablets.

Descaling. Espresso machines must be descaled every three months to remove mineral build-up. In areas with very hard water, descale every two months instead. Descaling is done by the head barista and logged in the maintenance binder.

Roaster. The chaff collector on the roaster is emptied after every roasting session. The roaster exhaust ducts are inspected and cleaned by an external technician twice a year, in January and July, to reduce fire risk.

Water filters. Replace the water filter cartridges every six months or after 3,000 litres, whichever comes first.

Faults. If a machine shows an error code, switch it off, place an out-of-order sign on it and contact the service partner. Do not open electrical panels yourself.
`,
  },
];

export const SAMPLE_WORKSPACE_ID = "sample";
export const USER_WORKSPACE_ID = "personal";
