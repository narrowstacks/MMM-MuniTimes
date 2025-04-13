Module.register("MMM-MuniTimes", {
    // Default module config.
    defaults: {
        apiKey: "", // 511.org API key
        stops: [
            // Example: { stopCode: "12345", stopName: "Market St & 7th St", direction: "Inbound", lineNames: { "N": "N-Judah", "14": "14-Mission" } }
            // Note: specifying lineNames will both filter to only show listed lines AND rename them as specified
        ],
        agency: "SF", // Default agency is SF Muni
        updateInterval: 60000, // refresh every minute (in ms)
        maxResults: 3, // maximum number of arrivals to display per stop
        showEmptyLines: true, // show "No arrivals" when no data
        showLineIcons: true, // show the owl/express icons
        showStopNames: true, // show stop names in the UI
        timeFormat: "minutes", // options: "minutes", "verbose", "full"
        timeZone: "America/Los_Angeles", // default to Pacific time
        groupByLine: false, // group inbound and outbound stops together
        retryDelay: 10000, // delay before retrying after an error (10 seconds)
        maxRetries: 3, // maximum number of consecutive retries
    },

    // Define start sequence.
    start: function() {
        Log.info("Starting module: " + this.name);
        this.loaded = false;
        this.stopsData = [];
        this.errorMessage = null;
        this.cachedStopsData = {}; // Cache for storing last valid data by stopCode
        this.retryTimers = {}; // Track retry timers by stopCode
        this.retryCount = {}; // Track retry count by stopCode
        
        // Backward compatibility: convert old stopCode to new stops format
        if (this.config.stopCode && !this.config.stops.length) {
            this.config.stops = [{ stopCode: this.config.stopCode }];
        }
        
        // Add original index to each stop in config
        this.config.stops.forEach((stop, index) => {
            stop.originalIndex = index;
            this.retryCount[stop.stopCode] = 0; // Initialize retry count
        });
        
        this.scheduleUpdate();
    },

    // Override dom generator.
    getDom: function() {
        var wrapper = document.createElement("div");
        wrapper.className = "muni-times";
        
        if (this.errorMessage) {
            wrapper.innerHTML = this.errorMessage;
            wrapper.className = "dimmed light small";
            return wrapper;
        }
        
        if (!this.loaded) {
            wrapper.innerHTML = "Loading...";
            wrapper.className = "dimmed light small";
            return wrapper;
        }
        
        if (this.stopsData.length === 0) {
            if (this.config.showEmptyLines) {
                var emptyDiv = document.createElement("div");
                emptyDiv.innerHTML = "No data";
                emptyDiv.className = "dimmed light small";
                wrapper.appendChild(emptyDiv);
            }
            return wrapper;
        }
        
        if (this.config.groupByLine) {
            // Group data by line for displaying inbound and outbound together
            const lineGroups = this.groupStopsByLine();
            
            // For each line, display the stop information
            Object.keys(lineGroups).forEach(lineName => {
                const lineData = lineGroups[lineName];
                
                // Add line name as a header with the icon
                var lineNameDiv = document.createElement("div");
                lineNameDiv.className = "line-header bright";
                const lineIcon = lineData.lineIcon || "";
                lineNameDiv.innerHTML = lineIcon ? `${lineIcon} ${lineName}` : lineName;
                
                wrapper.appendChild(lineNameDiv);
                
                // Create table for arrivals
                var table = document.createElement("table");
                table.className = "small";
                
                // Add inbound and outbound arrivals
                Object.keys(lineData.directions).forEach(direction => {
                    const directionData = lineData.directions[direction];
                    
                    if (directionData.arrivals.length === 0 && this.config.showEmptyLines) {
                        var emptyRow = document.createElement("tr");
                        var emptyCell = document.createElement("td");
                        emptyCell.colSpan = 2;
                        emptyCell.className = "dimmed light";
                        emptyCell.innerHTML = `${direction}: No arrivals`;
                        emptyRow.appendChild(emptyCell);
                        table.appendChild(emptyRow);
                    } else {
                        directionData.arrivals.forEach(arrival => {
                            var row = document.createElement("tr");
                            
                            // Direction without icon
                            var lineCell = document.createElement("td");
                            lineCell.className = "line-name bright";
                            lineCell.innerHTML = direction;
                            row.appendChild(lineCell);
                            
                            // Times
                            var timeCell = document.createElement("td");
                            timeCell.className = "arrival-time bright";
                            
                            if (arrival.times.length === 0) {
                                timeCell.innerHTML = "No arrivals";
                                timeCell.className = "dimmed light";
                            } else {
                                // Show times with destinations if needed
                                const timeElements = arrival.times.map(time => {
                                    let timeText = time.formattedTime;
                                    // Only show asterisk with time if there are multiple destinations
                                    if (arrival.destinationList && arrival.destinationList.length > 1 && time.destination) {
                                        return `${timeText}*`;
                                    }
                                    return timeText;
                                });
                                
                                timeCell.innerHTML = timeElements.join(", ");
                            }
                            
                            row.appendChild(timeCell);
                            table.appendChild(row);
                        });
                    }
                });
                
                wrapper.appendChild(table);
                
                // Add separator between lines
                if (Object.keys(lineGroups).indexOf(lineName) < Object.keys(lineGroups).length - 1) {
                    var separator = document.createElement("div");
                    separator.className = "stop-separator";
                    wrapper.appendChild(separator);
                }
            });
        } else {
            // Original behavior: For each stop, create a section
            this.stopsData.forEach(stopData => {
                // Add stop name if enabled and available
                if (this.config.showStopNames && stopData.stopName) {
                    var stopNameDiv = document.createElement("div");
                    stopNameDiv.className = "stop-name bright";
                    stopNameDiv.innerHTML = stopData.stopName;
                    wrapper.appendChild(stopNameDiv);
                }
                
                // Create table for arrivals
                var table = document.createElement("table");
                table.className = "small";
                
                if (stopData.arrivals.length === 0 && this.config.showEmptyLines) {
                    var emptyRow = document.createElement("tr");
                    var emptyCell = document.createElement("td");
                    emptyCell.colSpan = 2;
                    emptyCell.className = "dimmed light";
                    emptyCell.innerHTML = "No arrivals";
                    emptyRow.appendChild(emptyCell);
                    table.appendChild(emptyRow);
                } else {
                    stopData.arrivals.forEach(arrival => {
                        var row = document.createElement("tr");
                        
                        // Line number/name
                        var lineCell = document.createElement("td");
                        lineCell.className = "line-name bright";
                        lineCell.innerHTML = arrival.line;
                        
                        // Add destinations below the line if there are multiple
                        if (arrival.destinationList && arrival.destinationList.length > 0) {
                            const destinations = document.createElement("div");
                            destinations.className = "small dimmed";
                            destinations.innerHTML = arrival.destinationList.join(", ");
                            lineCell.appendChild(destinations);
                        }
                        
                        row.appendChild(lineCell);
                        
                        // Times
                        var timeCell = document.createElement("td");
                        timeCell.className = "arrival-time bright";
                        
                        if (arrival.times.length === 0) {
                            timeCell.innerHTML = "No arrivals";
                            timeCell.className = "dimmed light";
                        } else {
                            // Show times with destinations if needed
                            const timeElements = arrival.times.map(time => {
                                let timeText = time.formattedTime;
                                // Only show asterisk with time if there are multiple destinations
                                if (arrival.destinationList && arrival.destinationList.length > 1 && time.destination) {
                                    return `${timeText}*`;
                                }
                                return timeText;
                            });
                            
                            timeCell.innerHTML = timeElements.join(", ");
                        }
                        
                        row.appendChild(timeCell);
                        table.appendChild(row);
                    });
                }
                
                wrapper.appendChild(table);
                
                // Add a separator between stops (except for the last one)
                if (this.stopsData.indexOf(stopData) < this.stopsData.length - 1) {
                    var separator = document.createElement("div");
                    separator.className = "stop-separator";
                    wrapper.appendChild(separator);
                }
            });
        }
        
        return wrapper;
    },
    
    // Group stops by line and direction (inbound/outbound)
    groupStopsByLine: function() {
        const lineGroups = {};
        const lineOrder = [];
        
        this.stopsData.forEach(stopData => {
            // Use direction from API or config directly
            let direction = "Unknown";
            
            if (stopData.direction) {
                // Use direction provided in config
                direction = stopData.direction;
            } else if (stopData.arrivals && stopData.arrivals.length > 0 && stopData.arrivals[0].journey) {
                // Try to get direction from the API data if available
                direction = stopData.arrivals[0].journey.DirectionRef || "Unknown";
            }
            
            // Group by line and direction
            stopData.arrivals.forEach(arrival => {
                // Extract the base line name without icons
                let baseLine = arrival.line;
                let lineIcon = "";
                
                // Extract icon if present
                if (baseLine.includes(" ")) {
                    const parts = baseLine.split(" ");
                    // Check if first part contains emoji
                    if (/[\u{1F300}-\u{1F6FF}]/u.test(parts[0])) {
                        lineIcon = parts[0];
                        baseLine = parts.slice(1).join(" ");
                    } else {
                        baseLine = parts.join(" ");
                    }
                }
                
                if (!lineGroups[baseLine]) {
                    lineGroups[baseLine] = {
                        lineIcon: lineIcon,
                        directions: {},
                        destinations: {},
                        originalIndex: stopData.originalIndex // Store the original index for sorting
                    };
                    lineOrder.push(baseLine);
                } else if (lineGroups[baseLine].originalIndex > stopData.originalIndex) {
                    // Update the originalIndex to be the lowest index among all stops for this line
                    lineGroups[baseLine].originalIndex = stopData.originalIndex;
                }
                
                // Update icon if we don't have one yet
                if (!lineGroups[baseLine].lineIcon && lineIcon) {
                    lineGroups[baseLine].lineIcon = lineIcon;
                }
                
                if (!lineGroups[baseLine].directions[direction]) {
                    lineGroups[baseLine].directions[direction] = {
                        arrivals: []
                    };
                }
                
                // Store destinations for this line
                arrival.times.forEach(time => {
                    if (time.destination && !lineGroups[baseLine].destinations[time.destination]) {
                        lineGroups[baseLine].destinations[time.destination] = true;
                    }
                });
                
                lineGroups[baseLine].directions[direction].arrivals.push(arrival);
            });
        });
        
        // Convert destination objects to arrays
        Object.keys(lineGroups).forEach(lineName => {
            lineGroups[lineName].destinationList = Object.keys(lineGroups[lineName].destinations);
        });
        
        // Create a new ordered object based on the original indexes
        const sortedLineGroups = {};
        
        // Sort the line names by their original index
        lineOrder.sort((a, b) => {
            return (lineGroups[a].originalIndex || 0) - (lineGroups[b].originalIndex || 0);
        });
        
        // Add the lines to the result object in the sorted order
        lineOrder.forEach(lineName => {
            sortedLineGroups[lineName] = lineGroups[lineName];
        });
        
        return sortedLineGroups;
    },
    
    // Fetch the arrival data for all stops
    fetchArrivals: function() {
        if (!this.config.apiKey) {
            this.errorMessage = "Please set apiKey in config";
            this.updateDom();
            return;
        }
        
        if (!this.config.stops || this.config.stops.length === 0) {
            this.errorMessage = "Please set at least one stop in the stops array";
            this.updateDom();
            return;
        }
        
        // Reset stops data if this is a full refresh (not a retry for specific stops)
        if (arguments.length === 0) {
            // Full refresh, not a retry
            this.stopsData = [];
        }
        
        // Fetch data for each stop
        this.config.stops.forEach(stop => {
            // If this is a retry for specific stops, only fetch those
            if (arguments.length > 0 && arguments[0] !== stop.stopCode) {
                return;
            }
            
            const url = `https://api.511.org/transit/StopMonitoring?api_key=${this.config.apiKey}&agency=${this.config.agency}&stopcode=${stop.stopCode}&format=json`;
            
            this.sendSocketNotification("FETCH_MUNI_DATA", { 
                url: url,
                stopConfig: stop 
            });
        });
    },
    
    // Schedule the next update
    scheduleUpdate: function() {
        var self = this;
        setInterval(function() {
            self.fetchArrivals();
        }, this.config.updateInterval);
        
        // Initial fetch after starting
        self.fetchArrivals();
    },
    
    // Schedule a retry for a specific stop
    scheduleRetry: function(stopCode) {
        const self = this;
        
        // Clear any existing retry timer for this stop
        if (this.retryTimers[stopCode]) {
            clearTimeout(this.retryTimers[stopCode]);
        }
        
        // Increment retry count
        this.retryCount[stopCode] = (this.retryCount[stopCode] || 0) + 1;
        
        // Only retry if we haven't exceeded the maximum retries
        if (this.retryCount[stopCode] <= this.config.maxRetries) {
            Log.info(`${this.name}: Scheduling retry #${this.retryCount[stopCode]} for stop ${stopCode} in ${this.config.retryDelay}ms`);
            
            // Set a new timer
            this.retryTimers[stopCode] = setTimeout(function() {
                Log.info(`${self.name}: Retrying fetch for stop ${stopCode}`);
                self.fetchArrivals(stopCode); // Pass stopCode to only fetch this specific stop
            }, this.config.retryDelay);
        } else {
            Log.info(`${this.name}: Maximum retry attempts (${this.config.maxRetries}) reached for stop ${stopCode}`);
            // Reset retry count - next regular update will try again
            this.retryCount[stopCode] = 0;
        }
    },
    
    // Socket notification received
    socketNotificationReceived: function(notification, payload) {
        if (notification === "MUNI_DATA_RESULT") {
            this.processData(payload);
        }
    },
    
    // Process the received data
    processData: function(data) {
        if (!data) {
            // If completely missing data and we have cached data, continue displaying it
            if (this.stopsData.length > 0) {
                this.loaded = true;
                this.updateDom();
            } else {
                this.errorMessage = "Error fetching data";
                this.loaded = true;
                this.updateDom();
            }
            
            // Schedule a retry if we have stop information
            if (data && data.stopConfig && data.stopConfig.stopCode) {
                this.scheduleRetry(data.stopConfig.stopCode);
            }
            
            return;
        }
        
        // Get the stopCode for possible retry
        const stopCode = data.stopConfig ? data.stopConfig.stopCode : null;
        
        // Check if the API returned an error
        if (data.error) {
            // If we have cached data for this stop, use it instead
            const cachedData = this.cachedStopsData[stopCode];
            if (cachedData) {
                // Use cached data for this stop and keep other stops in stopsData
                const existingStopIndex = this.stopsData.findIndex(s => s.stopCode === stopCode);
                if (existingStopIndex >= 0) {
                    this.stopsData[existingStopIndex] = cachedData;
                } else {
                    this.stopsData.push(cachedData);
                }
                
                this.loaded = true;
                this.updateDom();
            } else {
                // If no cached data available, just show the error
                this.errorMessage = data.error;
                this.loaded = true;
                this.updateDom();
            }
            
            // Schedule a retry
            if (stopCode) {
                this.scheduleRetry(stopCode);
            }
            
            return;
        }
        
        // Check if API returned valid data structure
        const hasValidData = data.data && 
                            data.data.ServiceDelivery && 
                            data.data.ServiceDelivery.StopMonitoringDelivery &&
                            data.data.ServiceDelivery.StopMonitoringDelivery.MonitoredStopVisit &&
                            data.data.ServiceDelivery.StopMonitoringDelivery.MonitoredStopVisit.length > 0;
        
        // If no valid data and we have cached data for this stop, use the cache
        if (!hasValidData) {
            if (this.cachedStopsData[stopCode]) {
                const cachedData = this.cachedStopsData[stopCode];
                
                // Add or update stop data with cached data
                const existingStopIndex = this.stopsData.findIndex(s => s.stopCode === stopCode);
                if (existingStopIndex >= 0) {
                    this.stopsData[existingStopIndex] = cachedData;
                } else {
                    this.stopsData.push(cachedData);
                }
                
                this.loaded = true;
                this.errorMessage = null;
                this.updateDom();
            }
            
            // Schedule a retry
            if (stopCode) {
                this.scheduleRetry(stopCode);
            }
            
            return;
        }
        
        // If we get here, we have valid data, so reset the retry count
        if (stopCode) {
            this.retryCount[stopCode] = 0;
        }
        
        // Format arrivals for this stop
        const formattedData = {
            stopCode: stopCode,
            stopName: data.stopConfig.stopName || data.stopConfig.stopCode,
            direction: data.stopConfig.direction, // Add direction support
            originalIndex: data.stopConfig.originalIndex, // Add original index from config
            arrivals: this.formatArrivals(data.data, data.stopConfig),
            lastUpdated: new Date().getTime() // Add timestamp of when this data was fetched
        };
        
        // Cache the valid data for this stop
        this.cachedStopsData[stopCode] = formattedData;
        
        // Add or update stop data
        const existingStopIndex = this.stopsData.findIndex(s => s.stopCode === stopCode);
        if (existingStopIndex >= 0) {
            this.stopsData[existingStopIndex] = formattedData;
        } else {
            this.stopsData.push(formattedData);
        }
        
        // Sort stops based on the original index from config
        this.stopsData.sort((a, b) => {
            return (a.originalIndex || 0) - (b.originalIndex || 0);
        });
        
        this.loaded = true;
        this.errorMessage = null;
        this.updateDom();
    },
    
    // Format the arrivals data
    formatArrivals: function(data, stopConfig) {
        try {
            const arrivals = {};
            
            if (!data.ServiceDelivery || 
                !data.ServiceDelivery.StopMonitoringDelivery || 
                !data.ServiceDelivery.StopMonitoringDelivery.MonitoredStopVisit) {
                return [];
            }
            
            const visits = data.ServiceDelivery.StopMonitoringDelivery.MonitoredStopVisit;
            
            visits.forEach((visit) => {
                const journey = visit.MonitoredVehicleJourney;
                if (!journey || !journey.MonitoredCall) return;
                
                const lineRef = journey.LineRef ? journey.LineRef.toUpperCase() : "";
                
                // Skip this line if lineNames is specified and this line is not in the list
                if (stopConfig.lineNames && Object.keys(stopConfig.lineNames).length > 0 && !stopConfig.lineNames.hasOwnProperty(lineRef)) {
                    return;
                }
                
                // Use custom line name if defined, otherwise use the line reference
                let line = lineRef;
                if (stopConfig.lineNames && stopConfig.lineNames[lineRef]) {
                    line = stopConfig.lineNames[lineRef];
                }
                
                // Get destination or use custom name if defined
                let destination = journey.DestinationName || "";
                if (stopConfig.destinationNames && stopConfig.destinationNames[destination]) {
                    destination = stopConfig.destinationNames[destination];
                }
                
                // Store direction information from API if available
                let directionFromApi = journey.DirectionRef || null;
                
                const arrivalTime = journey.MonitoredCall.ExpectedArrivalTime;
                let timeInfo;
                
                // Apply the appropriate time format based on config
                switch (this.config.timeFormat) {
                    case "verbose":
                        timeInfo = this.timeUntilUtc(arrivalTime);
                        break;
                    case "full":
                        timeInfo = this.convertToLocalTime(arrivalTime);
                        break;
                    case "minutes":
                    default:
                        timeInfo = this.calculateMinutesUntilArrival(arrivalTime);
                }
                
                // Add special indicators for lines if configured
                let lineIcon = "";
                if (this.config.showLineIcons) {
                    // List of electric trolleybus routes in SF Muni
                    const trolleybusRoutes = ["1", "2", "3", "5", "6", "7", "8", "14", "21", "22", "24", "30", "31", "33", "41", "45", "49"];
                    
                    // First check if it's a number-based route
                    if (/^\d+$/.test(lineRef)) {
                        // Then check if it's a trolleybus route
                        if (trolleybusRoutes.includes(lineRef)) {
                            lineIcon = "🚎";  // Trolleybus
                        } else {
                            lineIcon = "🚌";  // Regular bus
                        }
                    }
                    // Cable car lines (C, PM, PH, or 59-61)
                    else if (lineRef === "C" || lineRef === "PM" || lineRef === "PH" || 
                        lineRef === "59" || lineRef === "60" || lineRef === "61") {
                        lineIcon = "🚟";  // Cable car
                    }
                    // Streetcar/Metro lines (letters: J, K, L, M, N, T, S, E, F)
                    else if (/^[JKLMNTSFE]$/.test(lineRef)) {
                        lineIcon = "🚇";  // Metro/streetcar
                    }
                    
                    // Add special service indicators to time
                    const isSpecialLine = (lineRef === "91" || lineRef.includes("OWL") || lineRef.includes("R"));
                    if (isSpecialLine) {
                        if (lineRef === "91" || lineRef.includes("OWL")) {
                            timeInfo = timeInfo + "🦉";  // Owl service
                        } else if (lineRef.includes("R")) {
                            timeInfo = timeInfo + "🚀";  // Express service
                        }
                    }
                }
                
                let formattedTime;
                if (this.config.timeFormat === "minutes") {
                    formattedTime = timeInfo + " min";
                } else {
                    formattedTime = timeInfo;
                }
                
                // Add the line icon to the line name
                let lineWithIcon = line;
                if (lineIcon) {
                    lineWithIcon = lineIcon + " " + line;
                }
                
                // Group arrivals by line only, not by destination
                const lineKey = lineWithIcon;
                if (!arrivals[lineKey]) {
                    arrivals[lineKey] = {
                        line: lineWithIcon,
                        destinations: {},
                        journey: journey, // Store the journey data for direction info
                        times: []
                    };
                }
                
                // Store arrival time with its destination
                arrivals[lineKey].times.push({
                    minutes: this.calculateMinutesUntilArrival(arrivalTime),
                    formattedTime: formattedTime,
                    destination: destination
                });
                
                // Keep track of unique destinations for this line
                if (destination && !arrivals[lineKey].destinations[destination]) {
                    arrivals[lineKey].destinations[destination] = true;
                }
            });
            
            // Convert object to array and sort by minutes to first arrival
            const formattedArrivals = Object.values(arrivals);
            
            // Sort each line's times by minutes
            formattedArrivals.forEach(line => {
                line.times.sort((a, b) => {
                    const aMin = parseInt(a.minutes) || 999;
                    const bMin = parseInt(b.minutes) || 999;
                    return aMin - bMin;
                });
                
                // Limit to maxResults per line
                if (line.times.length > this.config.maxResults) {
                    line.times = line.times.slice(0, this.config.maxResults);
                }
                
                // Convert destinations object to array
                line.destinationList = Object.keys(line.destinations);
            });
            
            // Only sort by arrival time if not grouping by line 
            // (when grouping by line, we'll preserve original stop order)
            if (!this.config.groupByLine) {
                // Sort lines by the first arrival time
                formattedArrivals.sort((a, b) => {
                    const aMin = a.times.length > 0 ? (parseInt(a.times[0].minutes) || 999) : 999;
                    const bMin = b.times.length > 0 ? (parseInt(b.times[0].minutes) || 999) : 999;
                    return aMin - bMin;
                });
            }
            
            return formattedArrivals;
            
        } catch (error) {
            console.log("Error formatting arrivals: " + error);
            return [];
        }
    },
    
    // Calculate minutes until arrival from UTC timestamp
    // Equivalent to time_until_utc_min in Python
    calculateMinutesUntilArrival: function(arrivalTimeStr) {
        if (!arrivalTimeStr) return "?";
        
        try {
            const arrivalTime = new Date(arrivalTimeStr);
            const now = new Date();
            const diffMs = arrivalTime - now;
            const diffMinutes = Math.floor(diffMs / 60000); // Convert ms to minutes
            
            // Never return negative minutes (follow Python implementation)
            return diffMinutes > 0 ? diffMinutes.toString() : "0";
        } catch (error) {
            console.log("Error calculating minutes until arrival: " + error);
            return "?";
        }
    },
    
    // Calculate a verbose time until arrival (similar to time_until_utc in Python)
    timeUntilUtc: function(arrivalTimeStr) {
        if (!arrivalTimeStr) return "?";
        
        try {
            const arrivalTime = new Date(arrivalTimeStr);
            const now = new Date();
            const diffMs = arrivalTime - now;
            
            if (diffMs <= 0) return "Now";
            
            const diffSeconds = Math.floor(diffMs / 1000);
            const days = Math.floor(diffSeconds / 86400);
            const hours = Math.floor((diffSeconds % 86400) / 3600);
            const minutes = Math.floor((diffSeconds % 3600) / 60);
            const seconds = diffSeconds % 60;
            
            const timeParts = [];
            if (days > 0) timeParts.push(`${days} days`);
            if (hours > 0) timeParts.push(`${hours} hours`);
            if (minutes > 0) timeParts.push(`${minutes} minutes`);
            if (seconds > 0 && timeParts.length === 0) timeParts.push(`${seconds} seconds`);
            
            return timeParts.join(", ") || "Now";
        } catch (error) {
            console.log("Error calculating time until UTC: " + error);
            return "?";
        }
    },
    
    // Convert UTC time to local time with timezone (similar to convert_to_pst in Python)
    convertToLocalTime: function(utcTimeStr) {
        if (!utcTimeStr) return "?";
        
        try {
            const date = new Date(utcTimeStr);
            
            // Format options for displaying the time
            const options = {
                hour: "numeric",
                minute: "numeric",
                second: "numeric",
                hour12: true,
                timeZone: this.config.timeZone
            };
            
            return new Intl.DateTimeFormat("en-US", options).format(date);
        } catch (error) {
            console.log("Error converting to local time: " + error);
            return "?";
        }
    },
    
    getStyles: function() {
        return ["MMM-MuniTimes.css"];
    }
});
