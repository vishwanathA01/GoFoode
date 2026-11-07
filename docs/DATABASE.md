# GoFoode Database Design

MongoDB database: `gofoode`

| Collection | Key relationships | Purpose |
|---|---|---|
| users | owner/customer/partner references | Accounts and roles |
| restaurants | owner -> users | Restaurant profiles and approval |
| categories | restaurant -> restaurants | Menu categories |
| fooditems | restaurant -> restaurants | Food catalogue |
| carts | user -> users; items -> fooditems/restaurants | Persistent cart |
| orders | customer, restaurant, delivery | Restaurant-specific child orders |
| payments | groupOrderId, customer, order | Checkout/payment records |
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

For production, create child orders and payment records within a MongoDB replica-set transaction, add idempotency keys, and handle provider webhook retries.
