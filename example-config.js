/* Example configuration for the MMM-MuniTimes module */
module.exports = {
  modules: [
    {
      module: "MMM-MuniTimes",
      position: "top_right",
      header: "Muni Times",
      config: {
        apiKey: "YOUR_511_API_KEY", // Get from https://511.org/developers/
        stops: [
          {
            stopCode: "13543",
            stopName: "30th St & Church St",
            direction: "Northbound",
            lineNames: { 24: "24 Divisadero" },
          },
          {
            stopCode: "13538",
            stopName: "30th St & Church St",
            direction: "Southbound",
            lineNames: { 24: "24 Divisadero" },
          },
          {
            stopCode: "14000",
            stopName: "30th St & Church St",
            direction: "To Downtown",
            lineNames: { J: "J Church" },
          },
          {
            stopCode: "14004",
            stopName: "30th St & Church St",
            direction: "To Balboa Park",
            lineNames: { J: "J Church" },
          },
        ],
        agency: "SF", // Default: SF (for San Francisco Muni)
        updateInterval: 60000, // Update every 60 seconds
        maxResults: 2, // Show next 2 arrivals per stop
        showEmptyLines: true, // Show "No arrivals" when no data
        showLineIcons: true, // Show owl/express icons
        showStopNames: true, // Show stop names in the UI
        timeFormat: "minutes", // Time format (minutes, verbose, or full)
        timeZone: "America/Los_Angeles", // Timezone for displaying times
        groupByLine: true, // Option to group arrivals by line instead of stop
      },
    },
  ],
};
