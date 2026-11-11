# Demo video script (under 3 minutes)

Record the screen at 1080p. No copyrighted music. Upload to YouTube as **Public** (the rules require it to be publicly visible), then paste the link on Devpost.

| Time | Screen | What to say |
|---|---|---|
| 0:00 - 0:15 | Chat page, empty | "Online shopping takes too long, and most people in Pakistan shop in Urdu or Roman Urdu. Bazaar AI is a shopping agent: you say what you want and your budget, and it buys it for you with PayPal, safely." |
| 0:15 - 0:35 | Settings page: Link PayPal, sandbox login, back to Settings showing "PayPal linked", limits $20 per order and $50 per month | "First I link PayPal once using PayPal Vault, and I set my mandate: 20 dollars per order, 50 dollars per month, auto-buy on." |
| 0:35 - 1:05 | Chat: click "Under $10 mein best mascara le do". Show the product card, receipt, fee split, PayPal order id and the undo timer | "I ask in Roman Urdu. The agent searches our catalog, reads reviews, and picks the best value. Because the price is within my budget and my limits, the rules engine says auto-buy, and it pays with my saved PayPal. The platform keeps a 10 percent fee and the seller gets the rest." |
| 1:05 - 1:20 | Click Undo | "If I change my mind I have 10 minutes. Undo issues a full refund through PayPal." |
| 1:20 - 1:45 | Chat: "Under $30 achhi shirt chahiye, le lo". Show the Approve card, click Approve | "Now I ask for something over my 20 dollar limit. The AI wanted to buy it, but code, not the AI, enforces my limits, so it asks me for one-tap approval instead." |
| 1:45 - 2:00 | Urdu script chip | "It also works in Urdu script, and replies in the same script." |
| 2:00 - 2:30 | Admin page: totals, click Release payouts, show sellers paid and the event log | "Here is the money flow: total sales, platform revenue, and seller payouts sent with PayPal Payouts after the undo window. Every PayPal webhook is verified and logged." |
| 2:30 - 2:50 | README safety section or architecture diagram | "Safety: prices always come from our database, the AI cannot invent a budget, every PayPal call is idempotent, and the rules engine is unit tested. Bazaar AI is agentic commerce people can actually trust." |
