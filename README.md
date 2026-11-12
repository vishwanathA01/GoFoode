# GoFoode — Multi-Restaurant Food Ordering & Delivery Platform

The frontend is branded with the supplied GoFoode logo (`client/public/gofoode-logo.png`) and uses a premium white, orange and blue visual theme.

A MERN-stack SDP project with four role-based portals:
- Customer
- Restaurant Owner
- Delivery Partner
- Super Admin

## Stack
React + Vite, Express, MongoDB/Mongoose, JWT, bcryptjs, Socket.IO, Axios, Recharts, Lucide React.

## Requirements
- Node.js 20+
- npm
- MongoDB local instance or MongoDB Atlas database

## Quick start
Make sure MongoDB is running, then from the project folder:
```bash
npm run dev
```
That one command installs any missing packages, checks MongoDB, picks free ports (other projects on your machine can keep theirs), starts the API and the website, and prints the address to open:

```
  GoFoode is running  →  http://localhost:5173
```

First time only, add the demo data: `npm run seed`. To use your phone on the same Wi-Fi, open the **Network** URL that the website prints.

### Troubleshooting
| What you see | What to do |
|---|---|
| `MongoDB isn't reachable` | Start it: `brew services start mongodb-community` (macOS) or `docker run -d -p 27017:27017 mongo:7`, or put an Atlas URI in `server/.env` as `MONGODB_URI`. |
| `Port 5001 is already in use` | Another app holds the port. `npm run dev` from the project folder picks a free one automatically; or set `PORT` in `server/.env`. |
| A different website opens at `localhost:5173` | Another project is using that port. Use the URL printed after `GoFoode is running`. |
| Pages load but data doesn't | The API isn't running. Start everything with `npm run dev` from the project folder (not inside `client/`). |

### Running the API and website separately
```bash
cd server && npm run dev     # API on http://localhost:5001
cd client && npm run dev     # website; /api requests are forwarded to the API
```
If the API uses another port, start the website with `GOFOODE_API_PORT=<port> npm run dev`.

### Production
```bash
npm run build    # builds the website into client/dist
npm start        # the API serves the website and /api together on one port
```

## Demo accounts
The seed script creates:
- Admin: `admin@gofoode.demo` / `Admin123!`
- Restaurant owner: `owner@gofoode.demo` / `Owner123!`
- Delivery partner: `rider@gofoode.demo` / `Rider123!`
- Customer: `customer@gofoode.demo` / `Customer123!`

Change these credentials before any public deployment. The seed script is for development only.

## Included functionality
- Registration/login with hashed passwords and JWT.
- Role-based API access and frontend routing.
- Restaurant onboarding and admin approval.
- Restaurant menu CRUD.
- Restaurant discovery and food search.
- Persistent customer cart.
- Checkout creates one child order per restaurant under a shared groupOrderId.
- Food checkout takes UPI, card and net banking through Razorpay, or cash on delivery. Without Razorpay keys, development uses a built-in test gateway (see **Payments** below).
- Restaurant order status updates.
- Delivery assignment and status updates.
- Admin overview, user/restaurant/order management.
- Reviews and notifications.
- Customer feedback appears on the homepage after customers review completed orders; uploaded profile photos are available to every account role.
- Restaurant status changes notify customers in-app; ready orders notify online delivery partners, and order tracking shows shared rider GPS when available.
- Home page community and partner sections use live restaurant and review data rather than placeholder testimonials.
- Basic Socket.IO order event broadcast.
- Responsive role dashboards.
- **GoFoode Rewards** (`/rewards`): a free daily spin with a 7-day streak jackpot, refer & earn invite links, and a coupon wallet that shows up at checkout.
- **Live homepage**: trending dishes ranked by real orders, a live "just ordered" ticker, and a "What are you in the mood for?" dish finder.
- **Installable app**: add GoFoode to a phone's home screen; it opens instantly on repeat visits and shows a friendly page when offline. Shared links show a rich preview card.

## Important limitations
This is a runnable SDP foundation, not a certified production food-delivery service. Razorpay, Cloudinary and Google Maps require credentials and provider-side setup. Live GPS, email/SMS delivery and production-grade monitoring must be completed and tested before launch. Food payments are integrated with Razorpay, but they must be tested end to end against your own Razorpay account (test keys first, then live keys and a registered webhook) before taking real money.

## Environment
See `server/.env.example` and `client/.env.example`.

## Useful commands
```bash
npm run dev      # API + website together (from the project folder)
npm run seed     # reset demo data (development databases only)
npm run build    # production build of the website
npm start        # serve API + built website on one port
npm run setup    # install server and client packages
```

## Suggested next work
1. Test the Razorpay integration with your own test keys and webhook, then switch to live keys. Extend online payments to GoFoode Mart and Plus.
2. Add Cloudinary signed uploads.
3. Add Google Maps Places/Routes and authenticated GPS rooms.
4. Add Jest/Supertest integration tests and Playwright end-to-end tests.
5. Add MongoDB replica-set transactions for multi-document checkout.


## Expanded GoFoode marketplace modules

The latest GoFoode build extends the original four-role food marketplace with a Swiggy-inspired, multi-service experience while retaining GoFoode's own identity and visual system.

### Customer-facing services
- **Food delivery:** restaurant discovery with descriptions and delivery details, cuisine/category filters, detailed popular-dish cards, saved favourites, cart, multi-restaurant checkout, COD ordering, demo UPI/net-banking selections (pending; not charged), coupon validation and order-status tracking.
- **GoFoode Mart:** grocery and daily-essential catalogue, category/search filters, quantity basket and a guided basket → delivery details → payment selection → order confirmation checkout. Orders reserve stock atomically, roll stock back if order creation fails, and appear in customer grocery history.
- **Dineout:** image-backed restaurant discovery with cuisine, rating and location details, plus table-reservation requests with date, time, party size, occasion and reservation status.
- **Offers:** active coupon listing and validation (`WELCOME50`, `TASTY20`, `GOFOODE100` seeded for demo).
- **GoFoode Plus:** demo membership activation with 90-day membership record and member benefit presentation.
- **GoFoode Genie:** guided local pickup/drop requests, cancellation before driver acceptance, request status and partner GPS updates.
- **Experiences:** browse local food/social events and book demo tickets.
- **Customer account:** order history, notifications and saved restaurants.

### Partner and operations features
- Customer, restaurant-owner and delivery-partner onboarding.
- Restaurant applications and admin approval.
- Restaurant menu management with image upload, editing, offer pricing, availability and incoming order workflow.
- Delivery job acceptance, pickup, en-route and delivered workflow for food and Genie parcel requests.
- Admin users, restaurants, orders, transactions, reviews and support-ticket views.

### New API groups
- `/api/v1/addresses` — customer saved delivery addresses.
- `/api/v1/favorites` — save/remove/list favourite restaurants.
- `/api/v1/reservations` — Dineout reservation requests and cancellation.
- `/api/v1/grocery/products`, `/api/v1/grocery/orders` — GoFoode Mart catalogue and orders.
- `/api/v1/offers`, `/api/v1/coupons/validate` — offer discovery and coupon validation.
- `/api/v1/membership` — GoFoode Plus demo membership.
- `/api/v1/genie/requests` — local pickup/drop request records.
- `/api/v1/delivery/genie-requests` — driver pickup/drop assignments and delivery status.
- `/api/v1/experiences` and `/api/v1/experiences/:id/book` — local event discovery and bookings.
- `/api/v1/orders/:id` — customer order details for tracking.
- `/api/v1/profile` — update an account profile photo.
- `/api/v1/reviews/featured` — latest customer feedback for the homepage.

### Fresh setup / demo seed
The seed script creates GoFoode demo users, six sample restaurants with detailed dishes, grocery products, and demo coupons. The home page’s Popular dishes section reads the seeded menu catalog, including food images, ingredients, allergens, portions and preparation times. Restaurant owners can upload a menu photo or provide an image URL when adding a dish. Customers and all partner/admin roles can also upload a compressed profile photo. Uploaded photos are stored as compressed data URLs; for production, replace this demo storage with a managed image provider.

To add the Chinese-food and cold-drink restaurants, menu items and upcoming demo events without resetting existing users, orders, stock, or catalog content, run `npm run sync-marketplace` in `server/`. It requires the demo restaurant owner account. To add or refresh the grocery catalog without deleting existing orders or stock counts, run `npm run sync-grocery` in `server/`. Demo accounts:
- Admin: `admin@gofoode.demo` / `Admin123!`
- Restaurant owner: `owner@gofoode.demo` / `Owner123!`
- Delivery partner: `rider@gofoode.demo` / `Rider123!`
- Customer: `customer@gofoode.demo` / `Customer123!`

Run `npm run seed` only on a development database; it resets the demo users, demo restaurants, grocery products and selected demo coupons. Restaurant status and delivery-partner updates are in-app notifications; email/SMS sending is not configured. Live order maps show the delivery partner's latest shared GPS location only after they accept the delivery and grant location permission.

### Integrations and production hardening still required
This is an advanced academic/demo codebase, not a production-certified logistics platform. Online payments cover food orders only; GoFoode Mart orders and Plus subscriptions don't collect money yet. Production deployment still requires transactional stock updates, address/geocoding and maps integration, real-time GPS map UI, image storage, email/SMS/OTP, partner document/KYC review, refund and cancellation policies, privacy/security review, automated tests, rate/abuse controls and operational monitoring. Dineout currently records a reservation request; it does not check a restaurant's live table inventory.


## GPS, location-aware navigation and guided checkout
- On successful login/registration, the client requests browser geolocation permission. If a high-accuracy fix times out, it retries with the browser's lower-accuracy location provider. Coordinates are reverse-geocoded with OpenStreetMap Nominatim and the detected city/state are prefilled at checkout.
- The navbar location control and profile page can request GPS location or save a manually entered area, city, state and PIN. Manually selected locations are preserved across sign-in and session refreshes. Location errors explain permission, device-service and timeout issues.
- Every role dashboard links to a profile page with the signed-in user's contact details and role-specific activity (orders, restaurant applications, deliveries/earnings, or platform totals).
- The customer checkout now has three explicit stages: review selected dishes, enter delivery details, and review/place the order. Selecting a dish from a restaurant menu takes the customer directly to the cart/first checkout stage.
- Food checkout collects UPI, card and net banking payments (see **Payments**). The GoFoode Mart checkout still offers UPI and net banking as demo selections that leave payment pending and collect no money.
- The GoFoode Mart checkout has explicit basket, delivery details and order confirmation stages; a successful order shows its reference and payment status. The navbar location can prefill the checkout city, state and PIN. Sign-in returns the customer to the saved Instamart basket.
- Customer workspaces include grocery order history and quick links for food, groceries, addresses and favourites. Restaurant workspaces include menu/order shortcuts, restaurant status, revenue and recent kitchen orders. Delivery partners can accept and progress Genie pickup/drop requests alongside restaurant deliveries.
- Dineout restaurant cards show restaurant imagery and details before a reservation request is started. Reservations are requests and do not confirm live table availability.
- Menu items support calories, preparation time, spice level, ingredients, allergens, portion size and bestseller labels.
- Delivery partners share GPS while an accepted/picked-up/on-the-way assignment is active and location permission is granted. The customer order tracking page refreshes order/GPS data every seven seconds and shows the latest rider location on an OpenStreetMap embed.
- Browser geolocation requires user permission and a secure context (HTTPS in production; localhost is suitable for development). GPS sharing only works while the delivery partner dashboard is open and the browser/device is sharing location. This is not background tracking.
- Delivery tracking and active rider assignments use Google Maps embeds and directions links. Set `VITE_GOOGLE_MAPS_API_KEY` in `client/.env` to enable the Maps Embed API view; restrict the key to your local and production web origins and enable Maps Embed API in Google Cloud. Without a key, Google Maps preview and directions links remain available.
- The home-page chatbot supports OpenAI-compatible APIs and Google Gemini. For Gemini, set `CHATBOT_PROVIDER=gemini`, `CHATBOT_API_URL=https://generativelanguage.googleapis.com/v1beta/models`, `CHATBOT_API_KEY`, and `CHATBOT_MODEL=gemini-flash-lite-latest` in `server/.env`; restart the API afterward. Keep the key server-side and use a key generated for the Gemini API (not a Google Maps key). The assistant can also send signed-in conversations to the admin support queue.
- Customer dashboard tabs include saved delivery addresses, reservation history and GoFoode Plus membership. Restaurant partners can manage approved restaurant availability and review customer feedback. Delivery partners can control shift availability, view completed delivery earnings, and open their route in Google Maps. Admins can review platform metrics, activity logs and support-ticket statuses.
# GoFoode

## Payments
Food checkout supports UPI, cards and net banking through Razorpay, plus cash on delivery.

**Gateways.** `PAYMENT_GATEWAY=auto` (the default) uses Razorpay when `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` are set. Otherwise, outside production, it uses a built-in test gateway that moves no money. In production with no keys, only cash on delivery is offered. The test gateway's payment window can simulate a success, a bank decline, or a payment where the app loses its connection.

**How an online order flows.** Checkout creates the orders in `awaiting_payment` and opens a payment window. Restaurants don't see these orders until the payment succeeds. A failed or abandoned payment can be retried, switched to cash on delivery, or cancelled. If nothing happens for `PAYMENT_WINDOW_MINUTES` (default 15), the orders are cancelled and the items go back into the customer's cart.

**Reliability.**
- **No duplicate orders.** Checkout takes an `Idempotency-Key` header. A double-click, a retry after a timeout, or a request repeated from another tab returns the original orders instead of creating new ones. Two tabs checking out the same cart at once can't both succeed.
- **No surprise totals.** The client sends the total it showed. If prices changed, checkout stops and shows the new total.
- **Server-side confirmation.** A payment counts only after its Razorpay signature is verified (constant-time comparison) and the amount, currency and order are confirmed with Razorpay. Authorised payments are captured.
- **Payments confirmed even without the browser.** Signed webhooks (`POST /api/v1/payments/webhooks/razorpay`) confirm payments when the customer closes the tab, and each webhook event is processed once. Before cancelling an unpaid checkout, the server asks Razorpay whether it was paid, so a missed webhook never cancels a paid order.
- **Stray payments refunded.** Money that arrives after a checkout closed (expired, cancelled or switched to cash), or a second payment for the same order, is refunded automatically.
- **Automatic refunds.** A paid order is refunded when the customer cancels it before the restaurant accepts, or when the restaurant rejects it. Admins can issue full or partial refunds with a reason. Refunds are reserved atomically, so the total refunded can never exceed what was paid. A refund whose outcome is unknown (for example, a timeout) is looked up later rather than sent twice.
- **Cash on delivery tracked.** The payment record is marked paid when the rider delivers and collects the cash.
- **Background sweep.** Every minute (`PAYMENT_SWEEP_INTERVAL_MS`) a sweep expires abandoned checkouts, rolls back checkouts interrupted by a crash, and follows up on refunds still pending.
- **Audit trail.** Every payment keeps a timeline of what happened and who triggered it. Customers see it on the order page; admins see transactions, a payment health summary and a **Reconcile** action.

**Razorpay setup.**
1. Add `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` (start with `rzp_test_` keys).
2. In the Razorpay dashboard, add a webhook pointing to `https://<your-api>/api/v1/payments/webhooks/razorpay`. Subscribe to `payment.captured`, `payment.authorized`, `payment.failed`, `order.paid`, `refund.processed` and `refund.failed`.
3. Put that webhook's secret in `RAZORPAY_WEBHOOK_SECRET`.

## Rewards and growth features
**Daily spin.** Each signed-in customer gets one free spin per day (days reset at midnight India time). Every spin wins a single-use coupon, valid for 3 days and worth up to ₹100. Spinning 7 days in a row guarantees one of the two best prizes, and missing a day restarts the streak. The server picks the prize, and a unique index stops anyone spinning twice in a day, even with simultaneous requests.

**Refer & earn.** Every customer has an invite link (`/register?ref=CODE`) they can share on WhatsApp or copy. A friend who signs up through it gets ₹75 off their first order. The inviter gets ₹100 off once that friend's first order reaches a restaurant: when it's placed for cash on delivery, or paid online. This happens once per friend.

**Coupon wallet.** Spin and referral coupons belong to one customer and can be used once. They appear in that customer's checkout under "Offers & coupons", never in the public offers list. Each coupon is reserved atomically when an order is placed, and released if that online checkout is cancelled or expires unpaid.

**Live pulse.** The homepage shows the most-ordered dishes of the last 7 days and a rolling feed of recent orders. The feed shows only the dish, restaurant and city, never customer details. It's computed from real orders, cached for a minute, and filled with bestsellers when it's a quiet week.

**Installable app.** `client/public/manifest.webmanifest` and `sw.js` make the site installable (Chrome confirms there are no installability errors). The service worker never caches `/api`, so prices, orders and payments are always live. It runs only in production builds. For link previews on WhatsApp and social media, use absolute URLs for `og:image` in `client/index.html` once you have a domain.

## Marketplace tabs
**Dineout.** Search and filter restaurants by cuisine, then book in one form: day chips for the next week (or any date up to 60 days ahead), lunch and dinner time slots (past times are disabled), a guest stepper, occasion chips and a note. A live "ticket" in the page header previews the booking. Requests can be cancelled until the restaurant confirms, and any upcoming table can be saved to your calendar as an `.ics` file.

**Pickup & drop.** Pickup and drop details with a one-tap Swap, quick parcel types (documents, keys, lunch box…), a clear list of what can and can't be sent, and each request's progress from "Requested" to "Delivered". The list refreshes every 20 seconds.

**Events.** Filter by category, see the next event featured, and book 1–10 spots with a live "spots left" bar. Seats are claimed atomically on the server, so the last spot can't be sold twice. Bookings can be cancelled before the event starts and added to your calendar.

**Offers.** Every live code as a ticket with copy and expiry, a customer's own prizes from spins and invites, and a savings calculator that ranks every code for an order total. "Use now" opens the cart with the code: it applies itself as soon as the cart has dishes, even if the customer adds them later.

**GoFoode Plus.** A public page with a membership card, perks, a savings estimator and FAQs. Free delivery is real: active members pay no delivery fee on food orders, and the cart shows "FREE with Plus". Membership is still a demo with no payment taken.

**Photos.** All photography is real, never AI-generated. Restaurant, dish and event photos come from Unsplash (free under the [Unsplash License](https://unsplash.com/license)). The delivery photos on the homepage, login and sign-up pages, and the link-preview image, are stored in `client/public/images/`. A restaurant without its own cover photo gets a real photo of its cuisine (`client/src/media.js`), and people without a profile photo get initials. `npm run sync-marketplace` (in `server/`) gives each demo event its own photo and restores missing demo restaurant covers. It never overwrites a cover an owner uploaded.

## Delivery location, dashboards and profile
**Location picker.** "Delivering to" in the header opens one sheet with these options:
- GPS ("Use my current location").
- Live place search: OpenStreetMap, India only. It runs as you type and keeps each place's coordinates.
- The customer's saved addresses, plus the last few places used.
- Ten popular cities.
- A manual form.

On phones it opens as a bottom sheet. A place you pick stays put; only GPS fixes refresh themselves hourly. The code is in `client/src/location.jsx`.

**Account dashboards.** Every role (customer, restaurant, rider, admin) shares one workspace shell:
- **Sidebar:** your photo or initials, plus a slide-in menu on phones.
- **Top bar:** breadcrumbs and a time-of-day greeting.
- **Command palette:** press ⌘K or Ctrl+K to jump to any page or quick action.

Stat cards, tables, status badges and forms use readable sizes and clear status colours. Orders appear as cards with restaurant photos and All, Active, Delivered and Cancelled filters, and owner lists show each restaurant's own photo.

**Profile.** A cover banner, an avatar you click to change (the new photo is previewed until you save), contact details, and a delivery-location card with a map and a "Change location" button.

**Public menus and 404.** Visitors can browse any restaurant's menu; adding to cart or saving a favourite asks them to log in. Unknown links show a 404 page with routes back into the site instead of silently opening the homepage.

**Demo avatar.** The demo customer uses a real photo (`client/public/images/avatar-demo-customer.jpg`, from Unsplash). Accounts without a photo get initials.

## GoFoode Mart checkout
After choosing groceries, customers go through a three-step secure checkout (`client/src/martCheckout.jsx`):
1. **Basket.** Line items with photos, MRP savings and quantity steppers. A free-delivery progress bar with quick top-up picks, and a choice of what to do if an item is out of stock (call me, replace with similar, or remove it).
2. **Delivery.** Saved addresses (new ones can be saved for next time). Express delivery (15–20 min, 7 AM–10:30 PM) or a two-hour slot today or tomorrow. Instruction chips such as "Leave at the door".
3. **Payment.** UPI, card or net banking through the same payment gateway as food orders (Razorpay, or the built-in test gateway), or cash on delivery. An optional tip for the delivery partner, and a final review of the address and slot.

**How the server keeps it safe:**
- Stock is reserved atomically: two shoppers can't buy the last units.
- Orders are idempotent: a retried request returns the same order instead of a second one.
- A total the customer didn't see is refused (`PRICE_CHANGED`).
- An online order waits as `awaiting_payment` and isn't released to the store until payment succeeds. If the payment window closes, the order is cancelled and its stock put back.
- Failed attempts can be retried or switched to cash. A paid order cancelled before packing is refunded automatically.

**Order page.** Each order opens at `/instamart/orders/:id`:
- live tracking (placed → packed → on the way → delivered) that updates on its own;
- the ETA or slot, the bill and payment status;
- payment recovery if the window was closed;
- Cancel, Print invoice and Buy these again.

The customer's Grocery orders page lists these as cards. Admins move orders along from Admin → Grocery orders. Cash is marked collected on delivery, and the customer is notified at each step.

**Endpoints:**
- `POST /grocery/orders`: send an `Idempotency-Key` header. The body has `slot` (`{ kind: "express" }` or `{ kind: "scheduled", start }`), `substitution`, `instructions`, `tip` and `expectedTotal`.
- `GET /grocery/orders/:id`
- `PATCH /grocery/orders/:id/cancel`
- `PATCH /admin/grocery-orders/:id` (`{ status }`)

Online grocery payments use the same `/payments/:id/*` routes as food orders.

