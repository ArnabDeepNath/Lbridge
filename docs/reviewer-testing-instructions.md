# App Store reviewer testing instructions — LBridge

> Complete every bracketed value before pasting this into the Partner Dashboard. Do not commit real credentials.

## External LBridge Directory account

- Login URL: [EXTERNAL_DIRECTORY_LOGIN_URL]
- Username: [PRE_CREATED_REVIEWER_USERNAME]
- Password: [PRE_CREATED_REVIEWER_PASSWORD]
- External account ID: [REVIEWER_ACCOUNT_ID]
- API key for Account connection: [REVIEWER_API_KEY]
- Live directory URL after syncing: [LIVE_REVIEWER_DIRECTORY_URL]

The reviewer account is pre-created. **2FA, OTP, CAPTCHA challenges, and email verification are disabled** for this account. It has permission to connect a Shopify store and view published products. No reviewer signup or approval wait is required.

## Test flow

1. Install LBridge on the development store using [APP_INSTALL_URL] and approve the requested scopes.
2. On the LBridge Admin home, use **Connect** in **1. Connect your LBridge Directory account** with the credentials above.
3. Confirm the success Banner says the store is connected and approved for publishing.
4. Open **Manage product publishing** and publish [REVIEWER_TEST_PRODUCT_NAME] to **LBridge Directory**. This product has a 1200 × 1200 image and SKU [REVIEWER_TEST_SKU].
5. Wait for the contextual feed sync, then open **View on LBridge Directory**. The product, localized price, variant, and inventory availability are visible at the live directory URL above.
6. Select the variant and click **Buy Now with Shopify**. Confirm the browser lands on the merchant's official Shopify Checkout with the selected item and quantity. No LBridge payment form or offsite order creation is used.
7. Optionally publish [INVALID_TEST_PRODUCT_NAME], which has no image/SKU, and confirm the product displays LBridge `REQUIRES_ACTION` feedback in Shopify Admin.

## Screencast

- URL: [PUBLIC_2_TO_3_MINUTE_ENGLISH_SCREENCAST_URL]
- Narration language: English
- The recording shows install → account connection → product publishing → live directory → Shopify Checkout in one uninterrupted flow.

## Support during review

- Email: [REVIEW_SUPPORT_EMAIL]
- Documentation: [PUBLIC_SETUP_DOCUMENTATION_URL]
