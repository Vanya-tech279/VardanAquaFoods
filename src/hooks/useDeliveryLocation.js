import { useCallback, useEffect, useRef, useState } from "react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";
const CACHE_PREFIX = "vafLocationCheck_";

// ---- small helpers for remembering the result during this browser session ----

function readCache(userId) {
    try {
        return JSON.parse(sessionStorage.getItem(CACHE_PREFIX + userId));
    } catch {
        return null;
    }
}

function writeCache(userId, result) {
    try {
        sessionStorage.setItem(CACHE_PREFIX + userId, JSON.stringify(result));
    } catch {
        // Storage can be blocked. The check still works, it just isn't remembered.
    }
}

function clearCache() {
    try {
        Object.keys(sessionStorage)
            .filter((key) => key.startsWith(CACHE_PREFIX))
            .forEach((key) => sessionStorage.removeItem(key));
    } catch {
        // Nothing to clear.
    }
}

// Wraps the browser's location request so we can use await.
function getPosition() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject({ code: "unsupported" });
            return;
        }

        navigator.geolocation.getCurrentPosition(resolve, reject, {
            // A rough position is enough for a 6 km check, and it is faster.
            enableHighAccuracy: false,
            timeout: 15000,
            maximumAge: 5 * 60 * 1000,
        });
    });
}

// ---------------------------------------------------------------
// useDeliveryLocation(userId)
// When a customer is signed in, finds their location once per
// browser session and asks the backend if we deliver there.
//
// status.state is one of:
//   idle        - nobody is signed in
//   checking    - waiting for permission or the server
//   deliverable - inside the delivery area
//   outside     - too far away
//   disabled    - delivery is not switched on yet
//   denied      - the customer blocked location access
//   error       - something went wrong, they can try again
// ---------------------------------------------------------------
export default function useDeliveryLocation(userId) {
    const [status, setStatus] = useState({ state: "idle" });
    const [dismissed, setDismissed] = useState(false);

    // Each check gets a number. If a newer check starts (or the customer
    // logs out), the older one is ignored when it finishes.
    const runIdRef = useRef(0);

    const runCheck = useCallback(async (checkedUserId) => {
        const runId = ++runIdRef.current;

        setStatus({ state: "checking" });
        setDismissed(false);

        try {
            const position = await getPosition();

            const response = await fetch(`${API_URL}/api/delivery/check-location`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude,
                }),
            });

            const data = await response.json();

            if (runId !== runIdRef.current) return;

            if (!response.ok || !data.success) {
                throw new Error(data.message || "Location check failed.");
            }

            let result;

            if (data.available) {
                result = {
                    state: "deliverable",
                    distanceKm: data.distanceKm,
                    deliveryFee: data.deliveryFee,
                    maxRadiusKm: data.maxRadiusKm,
                };
            } else if (data.distanceKm !== null) {
                result = {
                    state: "outside",
                    distanceKm: data.distanceKm,
                    maxRadiusKm: data.maxRadiusKm,
                };
            } else {
                result = { state: "disabled" };
            }

            setStatus(result);
            writeCache(checkedUserId, result);
        } catch (error) {
            if (runId !== runIdRef.current) return;

            // Code 1 = the customer pressed "Block" on the permission popup.
            if (error?.code === 1) {
                const denied = { state: "denied" };
                setStatus(denied);
                writeCache(checkedUserId, denied);
                return;
            }

            setStatus({
                state: "error",
                message:
                    error?.code === "unsupported"
                        ? "Your browser does not support location access."
                        : error?.code === 3
                          ? "Finding your location took too long."
                          : "We couldn't check your location right now.",
            });
        }
    }, []);

    useEffect(() => {
        // Signed out: forget everything so the next sign-in checks again.
        if (!userId) {
            runIdRef.current += 1;
            setStatus({ state: "idle" });
            clearCache();
            return;
        }

        // Page refreshed while signed in: reuse today's answer, don't ask again.
        const cached = readCache(userId);

        if (cached?.state) {
            setStatus(cached);
            return;
        }

        runCheck(userId);
    }, [userId, runCheck]);

    const recheck = useCallback(() => {
        if (userId) runCheck(userId);
    }, [userId, runCheck]);

    const dismiss = useCallback(() => setDismissed(true), []);

    return { status, dismissed, recheck, dismiss };
}