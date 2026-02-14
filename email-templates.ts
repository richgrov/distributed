import Handlebars from "handlebars";

export const userWelcomeTemplate = Handlebars.compile(`Welcome to VidEX!

Hi {{name}},

Welcome to the Video Game Exchange platform! Your account has been successfully created.

You can now start trading video games with other collectors in our community.

Account Email: {{email}}

Happy trading!

---
This is an automated message from VidEX. Please do not reply to this email.`);

export const offerReceivedTemplate = Handlebars.compile(`New Trade Offer!

Hi {{recipientName}},

You've received a new trade offer from {{offererName}}!

They're offering: {{offeredGameName}} ({{offeredGameYear}})
They're requesting: {{requestedGameName}} ({{requestedGameYear}})

Log in to your VidEX account to view and respond to this offer.

---
This is an automated message from VidEX. Please do not reply to this email.`);

export const offerAcceptedTemplate = Handlebars.compile(`Trade Offer Accepted!

Great news! {{recipientName}} has accepted your trade offer!

You're sending: {{offeredGameName}} ({{offeredGameYear}})
You're receiving: {{requestedGameName}} ({{requestedGameYear}})

Please arrange the exchange with {{recipientName}} through VidEX messaging or your preferred contact method.

---
This is an automated message from VidEX. Please do not reply to this email.`);

export const offerRejectedTemplate = Handlebars.compile(`Trade Offer Rejected

Unfortunately, {{recipientName}} has declined your trade offer.

You were offering: {{offeredGameName}} ({{offeredGameYear}})
For their: {{requestedGameName}} ({{requestedGameYear}})

Don't worry, there are other collectors on VidEX! Feel free to make offers to other users.

---
This is an automated message from VidEX. Please do not reply to this email.`);

export const passwordChangedTemplate = Handlebars.compile(`Password Changed

Hi {{name}},

Your VidEX account password has been successfully changed.

SECURITY NOTICE: If you did not make this change, please contact our support team immediately.

Your account remains secure and you can continue using VidEX with your new password.

---
This is an automated message from VidEX. Please do not reply to this email.`);

export const offerCreatedConfirmationTemplate = Handlebars.compile(`Trade Offer Sent!

Hi {{offererName}},

Your trade offer has been sent to {{recipientName}}!

You're offering: {{offeredGameName}} ({{offeredGameYear}})
You're requesting: {{requestedGameName}} ({{requestedGameYear}})

We'll notify you when {{recipientName}} responds to your offer.

---
This is an automated message from VidEX. Please do not reply to this email.`);

export const offerAcceptedRecipientTemplate = Handlebars.compile(`You Accepted a Trade!

Hi {{recipientName}},

You've accepted a trade offer from {{offererName}}!

You're sending: {{requestedGameName}} ({{requestedGameYear}})
You're receiving: {{offeredGameName}} ({{offeredGameYear}})

Please arrange the exchange with {{offererName}} through VidEX messaging or your preferred contact method.

---
This is an automated message from VidEX. Please do not reply to this email.`);

export const offerRejectedRecipientTemplate = Handlebars.compile(`You Declined a Trade Offer

Hi {{recipientName}},

You've declined the trade offer from {{offererName}}.

They were offering: {{offeredGameName}} ({{offeredGameYear}})
For your: {{requestedGameName}} ({{requestedGameYear}})

You can continue browsing other trade offers on VidEX.

---
This is an automated message from VidEX. Please do not reply to this email.`);
