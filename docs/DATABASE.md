# GoFoode Database Design

MongoDB database: `gofoode`

| Collection | Key relationships | Purpose |
|---|---|---|
| users | owner/customer/partner references | Accounts and roles |
| restaurants | owner -> users | Restaurant profiles and approval |
| categories | restaurant -> restaurants | Menu categories |
| fooditems | restaurant -> restaurants | Food catalogue |
| carts | user -> users; items -> fooditems/restaurants | Persistent cart |
| orders | customer, restaurant, delivery, payment | Restaurant-specific child orders; `placedAt` is set when an order reaches the kitchen |
| payments | groupOrderId, customer, orders | One per checkout: status, idempotency key, gateway references, attempts, refund ledger and event timeline |
| webhookevents | provider + eventId (unique, 30-day TTL) | Ensures each gateway webhook is processed once |
| deliveries | order, deliveryPartner | Delivery assignment and status |
| addresses | user | Saved delivery addresses |
| reviews | user, restaurant, order | Ratings and comments |
| coupons | standalone | Discount campaigns |
| notifications | user | In-app notifications |
| settlements | restaurant, order | Restaurant settlement ledger |
| supporttickets | user | Customer support |
| auditlogs | actor | Admin audit trail |

## Multi-restaurant checkout
A single cart may contain products from multiple restaurants. The checkout endpoint groups validated cart lines by restaurant and creates one Order document for each group. All child orders share a `groupOrderId`. The server recalculates prices from database records and stores item name/unit-price snapshots.

Checkout doesn't need a replica set. The payment record is created first, with a unique `(customer, idempotencyKey)` index that acts as the lock. The cart lines are claimed atomically, the orders are inserted, and the payment is then marked `pending`. If any step fails, the checkout is rolled back: its orders are deleted, the cart is restored and the key is freed. A background sweep cleans up any checkout a crash left in the `created` state. Every later payment state change is a conditional update, so webhooks, browser confirmations and the sweep can race without double-processing.

## Experiences and seat counting
`Experience` has `category`, `duration` and `highlights` for the Events page, plus `booked`: the number of seats held by confirmed bookings. A booking claims seats with one conditional update (`booked + tickets <= capacity`), and a cancellation gives them back, so the count can't drift above capacity under load. Events created before this field existed start their counter from their confirmed `ExperienceBooking` rows the first time someone books. The public listing always reports `spotsLeft` from the bookings themselves.

## Reservations
A customer can hold only one `requested` or `confirmed` reservation per restaurant, date and time. The API checks this before creating a new one. Dates are stored as midnight UTC of the chosen calendar day.

