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
- `POST /checkout` body `{ deliveryAddress, paymentMethod: "cod" }`
- `GET /orders/my-orders`
- `GET /orders/:id`
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
- `POST /grocery/orders` — create a stock-checked grocery order (COD demo).
- `GET /grocery/orders/mine` — current customer's grocery orders.
- `GET/POST /addresses` — list/create saved delivery addresses.
- `PATCH/DELETE /addresses/:id` — update/delete a saved address.
- `GET /favorites`, `POST /favorites/:restaurantId`, `DELETE /favorites/:restaurantId` — customer favourites.
- `GET/POST /reservations` — list/create Dineout table requests.
- `PATCH /reservations/:id/cancel` — cancel a pending reservation.
- `GET /offers`, `POST /coupons/validate` — coupon discovery and cart validation.
- `GET/POST /membership` and `/membership/subscribe` — GoFoode Plus demo membership.
- `GET /orders/:id` — permitted order detail for tracking.

- `POST /genie/requests`, `GET /genie/requests/mine` — local parcel pickup/drop requests.
- `GET /experiences`, `POST /experiences/:id/book`, `GET /experiences/bookings/mine` — experience discovery and ticket booking.
- `GET /restaurant/reservations`, `PATCH /restaurant/reservations/:id` — restaurant-side table request management.
- `GET /admin/grocery-orders`, `GET /admin/reservations` — additional admin oversight endpoints.

- `POST /delivery/location` — delivery partner's current GPS coordinates; accepted/active assignment only. Emits `delivery:location` to the customer's socket room and persists the latest point.
- `GET /orders/:id` — now includes populated delivery partner and latest GPS coordinates for the authorized customer.
