const NodeHelper = require("node_helper");
const fetch = require("node-fetch");

module.exports = NodeHelper.create({
    start: function() {
        console.log("Starting node helper for: " + this.name);
    },

    socketNotificationReceived: function(notification, payload) {
        if (notification === "FETCH_MUNI_DATA") {
            this.fetchMuniData(payload.url, payload.stopConfig);
        }
    },
    
    fetchMuniData: async function(url, stopConfig) {
        try {
            const response = await fetch(url);
            
            if (!response.ok) {
                throw new Error(`API request failed with status ${response.status}`);
            }
            
            // The API response sometimes has a BOM character at the beginning
            // We need to decode with utf-8-sig similar to the Python script
            const text = await response.text();
            const cleanedText = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
            const data = JSON.parse(cleanedText);
            
            // Send both the data and the stop configuration back to the module
            this.sendSocketNotification("MUNI_DATA_RESULT", {
                data: data,
                stopConfig: stopConfig
            });
        } catch (error) {
            console.error("Error fetching Muni data:", error);
            this.sendSocketNotification("MUNI_DATA_RESULT", { 
                error: "Failed to fetch data: " + error.message,
                stopConfig: stopConfig
            });
        }
    }
});
