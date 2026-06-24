/*
 * Time Library - Ported from Arduino Time Library
 * Original: https://github.com/PaulStoffregen/Time
 * 
 * Arduino-compatible time functions for Moddable SDK.
 * Uses JavaScript Date object as the underlying time source.
 */

// Time status constants
const timeStatus_t = Object.freeze({
	timeNotSet: 0,
	timeNeedsSync: 1,
	timeSet: 2
});

// Day of week constants
const timeDayOfWeek_t = Object.freeze({
	dowInvalid: 0,
	dowSunday: 1,
	dowMonday: 2,
	dowTuesday: 3,
	dowWednesday: 4,
	dowThursday: 5,
	dowFriday: 6,
	dowSaturday: 7
});

// Time element field indices
const tmByteFields = Object.freeze({
	tmSecond: 0,
	tmMinute: 1,
	tmHour: 2,
	tmWday: 3,
	tmDay: 4,
	tmMonth: 5,
	tmYear: 6,
	tmNbrFields: 7
});

// Constants for time calculations
const SECS_PER_MIN = 60;
const SECS_PER_HOUR = 3600;
const SECS_PER_DAY = 86400;
const DAYS_PER_WEEK = 7;
const SECS_PER_WEEK = 604800;
const SECS_YR_2000 = 946684800; // seconds at start of year 2000
const SECS_PER_YEAR = 31536000; // 365 * 24 * 60 * 60

// Leap year calculation
function isLeapYear(year) {
	return ((year % 4 === 0) && (year % 100 !== 0)) || (year % 400 === 0);
}

// Days in month (non-leap year)
const monthDays = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

// Get days in month for a given year
function daysInMonth(month, year) {
	if (month === 1 && isLeapYear(year)) return 29;
	return monthDays[month];
}

// Time elements structure (tmElements_t equivalent)
class TimeElements {
	constructor() {
		this.Second = 0;
		this.Minute = 0;
		this.Hour = 0;
		this.Wday = 1; // Sunday = 1
		this.Day = 1;
		this.Month = 1; // January = 1
		this.Year = 0; // years from 1970
	}
}

// Global time state
let currentTime = Date.now() / 1000; // current time in seconds since 1970
let syncProvider = null;
let syncInterval = 300; // default 5 minutes
let lastSyncTime = 0;
let status = timeStatus_t.timeNotSet;

// Convert time_t (seconds since 1970) to TimeElements
function breakTime(time) {
	const tm = new TimeElements();
	const d = new Date(time * 1000);
	
	tm.Second = d.getUTCSeconds();
	tm.Minute = d.getUTCMinutes();
	tm.Hour = d.getUTCHours();
	tm.Wday = d.getUTCDay() + 1; // JavaScript: 0=Sunday, Arduino: 1=Sunday
	tm.Day = d.getUTCDate();
	tm.Month = d.getUTCMonth() + 1; // JavaScript: 0=January, Arduino: 1=January
	tm.Year = d.getUTCFullYear() - 1970;
	
	return tm;
}

// Convert TimeElements to time_t (seconds since 1970)
function makeTime(tm) {
	const year = tm.Year + 1970;
	const month = tm.Month - 1;
	
	// Calculate days from 1970 to the given year
	let days = 0;
	for (let y = 1970; y < year; y++) {
		days += isLeapYear(y) ? 366 : 365;
	}
	
	// Add days for months in the current year
	for (let m = 0; m < month; m++) {
		days += daysInMonth(m, year);
	}
	
	// Add days in the current month
	days += tm.Day - 1;
	
	// Convert to seconds
	let seconds = days * SECS_PER_DAY;
	seconds += tm.Hour * SECS_PER_HOUR;
	seconds += tm.Minute * SECS_PER_MIN;
	seconds += tm.Second;
	
	return seconds;
}

// Get current time as seconds since 1970
function now() {
	// Check if sync is needed
	if (syncProvider && (Date.now() / 1000 - lastSyncTime > syncInterval)) {
		const syncedTime = syncProvider();
		if (syncedTime !== undefined) {
			currentTime = syncedTime;
			lastSyncTime = Date.now() / 1000;
			status = timeStatus_t.timeSet;
		} else {
			status = timeStatus_t.timeNeedsSync;
		}
	}
	
	// Return current time (incrementing since last sync)
	const elapsed = (Date.now() / 1000) - lastSyncTime;
	return currentTime + elapsed;
}

// Set the current time
function setTime(t) {
	if (typeof t === 'number') {
		currentTime = t;
	} else if (typeof t === 'object') {
		// setTime(hr, min, sec, day, month, yr)
		const tm = new TimeElements();
		tm.Hour = arguments[0];
		tm.Minute = arguments[1];
		tm.Second = arguments[2];
		tm.Day = arguments[3];
		tm.Month = arguments[4];
		tm.Year = arguments[5] - 1970;
		currentTime = makeTime(tm);
	}
	lastSyncTime = Date.now() / 1000;
	status = timeStatus_t.timeSet;
}

// Adjust time by a number of seconds
function adjustTime(adjustment) {
	currentTime += adjustment;
	lastSyncTime = Date.now() / 1000;
}

// Get hour (0-23)
function hour(t) {
	const time = (t !== undefined) ? t : now();
	const d = new Date(time * 1000);
	return d.getUTCHours();
}

// Get hour in 12-hour format (1-12)
function hourFormat12(t) {
	const h = hour(t);
	return h % 12 || 12;
}

// Check if time is AM
function isAM(t) {
	return hour(t) < 12;
}

// Check if time is PM
function isPM(t) {
	return hour(t) >= 12;
}

// Get minute (0-59)
function minute(t) {
	const time = (t !== undefined) ? t : now();
	const d = new Date(time * 1000);
	return d.getUTCMinutes();
}

// Get second (0-59)
function second(t) {
	const time = (t !== undefined) ? t : now();
	const d = new Date(time * 1000);
	return d.getUTCSeconds();
}

// Get day of month (1-31)
function day(t) {
	const time = (t !== undefined) ? t : now();
	const d = new Date(time * 1000);
	return d.getUTCDate();
}

// Get weekday (1=Sunday, 7=Saturday)
function weekday(t) {
	const time = (t !== undefined) ? t : now();
	const d = new Date(time * 1000);
	return d.getUTCDay() + 1;
}

// Get month (1=January, 12=December)
function month(t) {
	const time = (t !== undefined) ? t : now();
	const d = new Date(time * 1000);
	return d.getUTCMonth() + 1;
}

// Get year (full 4-digit year)
function year(t) {
	const time = (t !== undefined) ? t : now();
	const d = new Date(time * 1000);
	return d.getUTCFullYear();
}

// Get time status
function timeStatus() {
	return status;
}

// Set sync provider function
function setSyncProvider(getTimeFunction) {
	syncProvider = getTimeFunction;
	if (syncProvider) {
		const syncedTime = syncProvider();
		if (syncedTime !== undefined) {
			currentTime = syncedTime;
			lastSyncTime = Date.now() / 1000;
			status = timeStatus_t.timeSet;
		}
	}
}

// Set sync interval in seconds
function setSyncInterval(interval) {
	syncInterval = interval;
}

// Date string functions
const monthNames = ["", "January", "February", "March", "April", "May", "June", 
                    "July", "August", "September", "October", "November", "December"];
const monthShortNames = ["Err", "Jan", "Feb", "Mar", "Apr", "May", "Jun",
                          "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dayNames = ["Err", "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const dayShortNames = ["Err", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function monthStr(month) {
	return monthNames[month] || "Err";
}

function monthShortStr(month) {
	return monthShortNames[month] || "Err";
}

function dayStr(day) {
	return dayNames[day] || "Err";
}

function dayShortStr(day) {
	return dayShortNames[day] || "Err";
}

// Export all functions
export {
	timeStatus_t,
	timeDayOfWeek_t,
	tmByteFields,
	TimeElements,
	breakTime,
	makeTime,
	now,
	setTime,
	adjustTime,
	hour,
	hourFormat12,
	isAM,
	isPM,
	minute,
	second,
	day,
	weekday,
	month,
	year,
	timeStatus,
	setSyncProvider,
	setSyncInterval,
	monthStr,
	monthShortStr,
	dayStr,
	dayShortStr
};
