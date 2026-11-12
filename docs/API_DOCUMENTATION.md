# GoFoode API

Base URL: `/api/v1`

All protected endpoints require `Authorization: Bearer <accessToken>`.

## Authentication
- `POST /auth/register` — customer registration
- `POST /auth/onboard` — restaurant owner or delivery partner registration
- `POST /auth/login` — login
- `GET /auth/me` — current user

## Public marketplace
- `GET /restaurants?search=&cuisine=`
- `GET /restaurants/:id`
- `GET /food-items?search=&restaurant=`

## Customer
- `GET /cart`
- `POST /cart/items` body `{ foodItemId, quantity }`
- `PATCH /cart/items/:foodId` body `{ quantity }`
- `DELETE /cart/items/:foodId`
- `POST /checkout` header `Idempotency-Key: <uuid>`; body `{ deliveryAddress, paymentMethod: "cod" | "upi" | "card" | "netbanking", couponCode?, expectedTotal? }`. Returns `201` with `{ orders, payment }`; retrying with the same key returns `200` with the original result. Errors carry a `code`: `PRICE_CHANGED` (409), `CART_CHANGED` (409), `CHECKOUT_IN_PROGRESS` (409, retry), `IDEMPOTENCY_KEY_REUSED` (422), `GATEWAY_UNAVAILABLE` (503).
- `GET /orders/my-orders`
- `GET /orders/:id` includes a `payment` summary with status, refunds and the payment timeline
- `PATCH /orders/:id/cancel` body `{ reason? }`: allowed until the restaurant accepts; paid orders are refunded automatically
- `POST /reviews`
- `GET /notifications`
- `PATCH /notifications/:id/read`
- `POST /support`

## Restaurant owner
- `POST /restaurants`
- `GET /restaurant/mine`
- `GET /restaurant/dashboard`
- `POST /restaurant/menu`
- `GET /restaurant/menu`
- `PATCH /restaurant/menu/:id`
- `DELETE /restaurant/menu/:id`
- `GET /restaurant/orders`
- `PATCH /restaurant/orders/:id/status`

## Delivery partner
- `GET /delivery/assignments`
- `PATCH /delivery/assignments/:id/accept`
- `PATCH /delivery/assignments/:id/status`
- `POST /delivery/location`
- `GET /delivery/earnings`

## Admin
- `GET /admin/dashboard`
- `GET /admin/users`
- `PATCH /admin/users/:id/status`
- `GET /admin/restaurants`
- `PATCH /admin/restaurants/:id/status`
- `GET /admin/orders`
- `GET /admin/transactions`
- `POST /admin/coupons`
- `GET /admin/coupons`
- `GET /admin/reviews`
- `GET /admin/support`
- `PATCH /admin/support/:id`

## Health
- `GET /health` is exposed as `/api/v1/health`.


## Expanded marketplace endpoints
- `GET /grocery/products` — search/filter grocery products.
- `POST /grocery/orders` — create a grocery order. Send an `Idempotency-Key` header. Body: `items`, `address`, `paymentMethod` (`cod`, `upi`, `card` or `netbanking`), `slot`, `substitution`, `instructions`, `tip` (₹0–200) and `expectedTotal`. Stock is reserved atomically. Online orders return a `payment` to complete through `/payments/:id/*`.
- `GET /grocery/orders/:id` — one of the customer's grocery orders, with payment status and `canCancel`.
- `PATCH /grocery/orders/:id/cancel` — cancels before packing, restocks, and refunds online payments.
- `PATCH /admin/grocery-orders/:id` — admin moves an order to its next status (`packed` → `out_for_delivery` → `delivered`).
- `GET /grocery/orders/mine` — current customer's grocery orders.
- `GET/POST /addresses` — list/create saved delivery addresses.
- `PATCH/DELETE /addresses/:id` — update/delete a saved address.
- `GET /favorites`, `POST /favorites/:restaurantId`, `DELETE /favorites/:restaurantId` — customer favourites.
- `GET/POST /reservations` — list/create Dineout table requests. `POST` takes `restaurantId`, `date` (`YYYY-MM-DD`, today up to 60 days ahead), `time` (`HH:MM`), `guests` (1–20), optional `occasion` (≤60 chars) and `notes` (≤300 chars). It returns `400` for invalid input and `409` if the same customer already has an active request for that restaurant, date and time. The response includes the populated restaurant.
- `PATCH /reservations/:id/cancel` — cancel a pending reservation.
- `GET /offers`, `POST /coupons/validate` — coupon discovery and cart validation.
- `GET /membership` — the customer's membership plus `active: true|false`. `POST /membership/subscribe` starts a 90-day demo membership; it returns `409 ALREADY_MEMBER` (with the end date) while one is still active. Active members pay no food delivery fee: `/checkout` sets `deliveryFee` to 0 for every restaurant in the cart.
- `GET /orders/:id` — permitted order detail for tracking.

- `POST /genie/requests`, `GET /genie/requests/mine` — local parcel pickup/drop requests.
- `GET /experiences` — upcoming events (today onwards), each with `booked` and `spotsLeft`, plus `category`, `duration` and `highlights`.
- `POST /experiences/:id/book` — `{ tickets: 1–10 }`. Seats are claimed atomically, so simultaneous bookings can never oversell. A full or nearly full event returns `409` with `spotsLeft` and a message such as "Only 2 spots left". Past events return `404`.
- `GET /experiences/bookings/mine` — the customer's bookings with the event populated.
- `PATCH /experiences/bookings/:id/cancel` — cancels the customer's own confirmed booking and releases its seats. Returns `409` once the event has started.
- `GET /restaurant/reservations`, `PATCH /restaurant/reservations/:id` — restaurant-side table request management.
- `GET /admin/grocery-orders`, `GET /admin/reservations` — additional admin oversight endpoints.

- `POST /delivery/location` — delivery partner's current GPS coordinates; accepted/active assignment only. Emits `delivery:location` to the customer's socket room and persists the latest point.
- `GET /orders/:id` — now includes populated delivery partner and latest GPS coordinates for the authorized customer.

## Payments
- `GET /payments/config`: the active gateway (`razorpay`, `mock` or `null`), whether it is in test mode, the available methods and the payment window
- `GET /payments/:id`: payment status, refunds and timeline (owner or admin)
- `POST /payments/:id/session` body `{ method? }`: opens or reopens the gateway checkout (retries reuse the same gateway order)
- `POST /payments/:id/verify` body `{ providerOrderId, providerPaymentId, signature }`: verifies the signature and confirms the payment with the gateway; idempotent
- `POST /payments/:id/failure` body `{ providerPaymentId?, code?, reason?, dismissed? }`: records a declined attempt or a closed payment window
- `POST /payments/:id/switch-to-cod`: switches an unpaid online checkout to cash on delivery
- `POST /payments/:id/cancel`: cancels an unpaid online checkout and restores the cart
- `POST /payments/:id/simulate` body `{ outcome: "success" | "failure" | "disconnect", method }`: test gateway only, disabled in production
- `POST /payments/webhooks/razorpay`: Razorpay webhooks, verified with `RAZORPAY_WEBHOOK_SECRET`; each event is processed once

## Admin payments
- `GET /admin/transactions`
- `GET /admin/payments/summary`: amount collected and refunded, online success rate over 7 days, checkouts awaiting payment, refunds in progress
- `POST /admin/payments/:id/reconcile`: re-checks captures and pending refunds with the gateway
- `POST /admin/orders/:id/refund` body `{ amount?, reason }`: full or partial refund of an order paid online

## Rewards and discovery
- `GET /rewards` (customer): spin state (`available`, `streak`, `progress`, `spinsToBonus`, `nextSpinAt`), the wheel's prizes, active wallet coupons and referral stats with the invite code
- `POST /rewards/spin` (customer): spins once per day; returns `{ prize, prizeIndex, coupon, streak, bonus, nextSpinAt }`. A second spin the same day returns `409 ALREADY_SPUN`
- `GET /referrals/:code`: `{ valid, inviter, reward }` for the sign-up invite banner (first name only)
- `POST /auth/register` accepts an optional `referralCode`; the response includes `welcomeCoupon` when the code is valid
- `GET /offers`: public campaign coupons; with a customer token, also that customer's own unused reward coupons (`personal: true`)
- `GET /discover/pulse`: `{ trending, recent, ordersToday }`, built from real orders (dish, restaurant and city only)

