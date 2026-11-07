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

### 1. Backend
```bash
cd server
cp .env.example .env
npm install
npm run seed
npm run dev
```

The API runs at `http://localhost:5001/api/v1`.

### 2. Frontend
In another terminal:
```bash
cd client
cp .env.example .env
npm install
npm run dev
```

Open `http://localhost:5173`.

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
- COD checkout; online payment endpoint is a clearly marked Razorpay integration stub.
- Restaurant order status updates.
- Delivery assignment and status updates.
- Admin overview, user/restaurant/order management.
- Reviews and notifications.
- Customer feedback appears on the homepage after customers review completed orders; uploaded profile photos are available to every account role.
- Restaurant status changes notify customers in-app; ready orders notify online delivery partners, and order tracking shows shared rider GPS when available.
- Home page community and partner sections use live restaurant and review data rather than placeholder testimonials.
- Basic Socket.IO order event broadcast.
- Responsive role dashboards.

## Important limitations
This is a runnable SDP foundation, not a certified production food-delivery service. Razorpay, Cloudinary and Google Maps require credentials and provider-side setup. Live GPS, refund settlement, webhook verification, transactional payment orchestration, email/SMS delivery and production-grade monitoring must be completed and tested before launch. The demo payment endpoint deliberately does not claim to charge a card or UPI account.

## Environment
See `server/.env.example` and `client/.env.example`.

## Useful commands
```bash
# server
npm run dev
npm run seed

# client
npm run dev
npm run build
```

## Suggested next work
1. Configure Razorpay test credentials and implement order creation, signature verification and webhooks.
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
This is an advanced academic/demo codebase, not a production-certified logistics platform. Razorpay checkout and subscription collection are not activated; grocery orders currently use COD. Production deployment still requires verified payment webhooks, transactional stock/order updates, address/geocoding and maps integration, real-time GPS map UI, image storage, email/SMS/OTP, partner document/KYC review, refund and cancellation policies, privacy/security review, automated tests, rate/abuse controls and operational monitoring. Dineout currently records a reservation request; it does not check a restaurant's live table inventory.


## GPS, location-aware navigation and guided checkout
- On successful login/registration, the client requests browser geolocation permission. If a high-accuracy fix times out, it retries with the browser's lower-accuracy location provider. Coordinates are reverse-geocoded with OpenStreetMap Nominatim and the detected city/state are prefilled at checkout.
- The navbar location control and profile page can request GPS location or save a manually entered area, city, state and PIN. Manually selected locations are preserved across sign-in and session refreshes. Location errors explain permission, device-service and timeout issues.
- Every role dashboard links to a profile page with the signed-in user's contact details and role-specific activity (orders, restaurant applications, deliveries/earnings, or platform totals).
- The customer checkout now has three explicit stages: review selected dishes, enter delivery details, and review/place the order. Selecting a dish from a restaurant menu takes the customer directly to the cart/first checkout stage.
- Both food and GoFoode Mart checkouts offer COD, UPI and net banking selections. UPI and net banking currently create demo orders with payment pending; they do not collect money. Configure and verify a payment gateway before accepting online payments.
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
