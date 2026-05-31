# OneStopAnalytics Logs & Debugging Guide

Welcome to the debugging guide! This guide explains all log outputs, system states, and troubleshooting methods in simple, non-fancy terms to help you manage the platform easily.

---

## 📂 Active Workspace Folder
We are working inside the root project directory:
**`D:\OneStopAnalytics_Main`**

---

## 🛠️ How to Start the Platform
To boot up the platform, open your terminal inside the root directory (`D:\OneStopAnalytics_Main`) and run:
```bash
npm start
```
This runs the high-resilience supervisor (`supervisor.js`) which automatically launches, health-checks, and monitors all four microservices.

---

## 📝 Understanding the Logs

The supervisor log output has been simplified to fit perfectly on your screen with no date/time noise or bulky service brackets. Here is what each type of log means:

### 1. `[INFO] Launching service [Name]...`
* **What it means:** The supervisor is opening and setting up a microservice.
* **Debugging Tip:** This is normal startup behavior. No action is required.

### 2. `[SUCCESS] Process spawned for [Name] (PID XXXX)`
* **What it means:** The microservice was successfully booted and assigned a unique process identifier (PID) by your system.
* **Debugging Tip:** Indicates that the computer launched the process correctly.

### 3. `[INFO] API Server active on port XXXX`
* **What it means:** The backend server (ETL, Data Warehouse, or Analytics) is live and ready to receive requests.
* **Debugging Tip:** Confirming that the backend is healthy.

### 4. `[INFO] Frontend Dev Server active at http://localhost:5173/`
* **What it means:** The user interface website is active.
* **Debugging Tip:** You can open this link in your browser to access the dashboard.

### 5. `[WARNING] Systems Status Matrix: ...`
* **What it means:** This status update prints only if one or more services are not in a healthy state (e.g. while starting up or if a port is blocked).
* **States explained:**
  * `RESTARTING`: The service is currently in the process of shutting down and starting fresh (often happens during boot or port collision).
  * `OK`: The service is online and healthy.
  * `TIMEOUT / OFFLINE`: The service did not respond to the health ping.

### 6. `[ERROR] Process for [Name] exited unexpectedly with code X`
* **What it means:** A service stopped or crashed.
* **Debugging Tip:** The supervisor will automatically trigger a clean watchdog restart to restore the service.

---

## 🔍 Troubleshooting Port Conflicts (Common Issue)
If you see all services constantly looping in `RESTARTING` or showing `TIMEOUT` in your terminal:
1. **Cause:** This usually means another background supervisor process (or a previous session) is already running in the background, keeping the network ports (`5173`, `8000`, `8004`, `8010`) occupied.
2. **How to Fix:** 
   * Close any other terminal instances running the project.
   * If you've just closed them, wait 5 seconds for the computer to free up the ports.
   * Run `npm start` again.
