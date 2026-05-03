# OBSIDIAN - Esports Hub & Marketplace

> *"Gaming Redefined."*

Obsidian is a centralized, full-stack gaming ecosystem designed to bridge the gap between amateur talent and professional esports. It provides a seamless platform for players to register for global tournaments, organizers to generate and manage live brackets, and gamers to trade hardware and digital assets in an integrated marketplace.

## Live Demo

**Experience Obsidian live:** https://obsidian-nine-ashy.vercel.app/login.html

*   **API Base URL:** `https://obsidian-oda1.onrender.com`
*   *Note: Our backend is hosted on Render's free tier. If the API takes a moment to respond on your first interaction, the server is just waking up from sleep mode!*

## Key Features

*   **Dynamic Tournament Architecture:** Organizers can generate live tournament brackets (powered by the Challonge API), load existing tournaments, and push live score updates directly from the Obsidian dashboard.
*   **Integrated Marketplace:** A centralized, database-driven e-commerce hub where users can browse high-end gaming hardware and digital accounts/skins. 
*   **Secure Authentication:** Full user registration, login, and session management secured via JSON Web Tokens (JWT).
*   **Cinematic UI/UX:** A highly responsive, neon-infused interface built with Tailwind CSS, featuring smooth transitions, glassmorphism, and dynamic game staging.
*   **Cloud Database:** A robust cloud database backend handling user profiles, centralized product inventories, and custom tournament configurations.

## Tech Stack & Deployment Architecture

**Frontend (Client)**
*   **Tech:** HTML5, Tailwind CSS
*   **Hosting:** vercel

**Backend (API)**
*   **Tech:** Node.js, Express.js, JWT Auth
*   **Hosting:** Render Web Service

**Database & External Integrations**
*   **Database:** MySQL , Tidb cloud database 
*   **Live Brackets:** Challonge REST API
*   **Live Match Tracking:** Pandascore API

---

##  Local Development

If you wish to clone and run this project locally for development purposes, follow these steps:

### 1. Clone the Repository
```bash
git clone https://github.com/Armubakh/Obsidian.git
cd obsidian-hub