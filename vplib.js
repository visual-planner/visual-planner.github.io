
angular.module("vpApp", []);

//////////////////////////////////////////////////////////////////////

angular.module("vpApp").service("vpConfiguration", function($window, $location, $rootScope) {
	$rootScope.vp = {};

	this.Load = function() {
		loadPermissions_then(loadAppData);
	}

	this.Authorise_then = loadPermissions_then;

	function onload() {
		$rootScope.$broadcast("config:load");
	};

	var permissions = {};
	$rootScope.vp.permissions = permissions;

	function loadPermissions_then(do_this) {
		google.accounts.oauth2.initTokenClient({
			client_id: $location.$$hash ? $location.$$hash : "186424320143-vb1h85auvvpnojvmeg9gi6lv9aan4ggi.apps.googleusercontent.com",
			scope: "https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/drive.appdata",
			prompt: "",
			callback: rcv
		}).requestAccessToken();

		function rcv() {
			if (google.accounts.oauth2.hasGrantedAllScopes(gapi.client.getToken(), "https://www.googleapis.com/auth/calendar.readonly"))
				permissions.view_calendars = true;

			if (google.accounts.oauth2.hasGrantedAllScopes(gapi.client.getToken(), "https://www.googleapis.com/auth/drive.appdata"))
				permissions.drive_appdata = true;

			do_this();
		}
	}

	var appdata = {
		title: "visual-planner",
		month_count: 6,
		scroll_buffer: 6,
		auto_scroll: true,
		auto_scroll_offset: -1,
		first_month: 1,
		hide_scrollbars: false,
		same_row_height: false,
		align_weekends: true,
		weekends: "6,0",
		first_day_of_week: 1,
		font_scale_pc: 100,
		past_opacity: 0.6,
		month_names: "Jan-Feb-Mar-Apr-May-Jun-Jul-Aug-Sep-Oct-Nov-Dec",
		proportional_events: false,
		proportional_start_hour: 8,
		proportional_end_hour: 20,
		show_timed_events: true,
		show_all_day_events: true,
		single_day_as_multi_day: false,
		text_on_singleday_events: true,
		text_on_multiday_events: true,
		scale_of_multiday_events: 100,
		event_background: 'cal'
	};
	$rootScope.vp.appdata = appdata;

	var drive = {};
	angular.copy(appdata, drive);

	var drive_file_name = "settings002.json";
	var drive_file_id = null;

	function loadAppData() {
		if (!permissions.drive_appdata) {
			onload();
			return;
		}

		loadDriveFileID(function() {
			if (drive_file_id) {
				gapi.client.request({
					path: "https://www.googleapis.com/drive/v3/files/" + encodeURIComponent(drive_file_id),
					method: "GET",
					params: {alt: 'media'}
				})
				.then(rcv, fail);
			}
			else
				onload();

			function rcv(response) {
				drive = JSON.parse(response.body);
				angular.copy(drive, appdata);
				onload();
			};
		});
	}

	this.saveAppData = function() {
		angular.copy(appdata, drive);

		loadDriveFileID(function() {
			if (drive_file_id) {
				write();
			}
			else {
				gapi.client.request({
					path: "https://www.googleapis.com/drive/v3/files",
					method: "POST",
					params: {uploadType: "resumable"},
					body: {name: drive_file_name, mimeType:"application/json", parents: ['appDataFolder']}
				})
				.then(rcv, fail);
			}

			function rcv(response) {
				drive_file_id = response.result.id;
				write();
			};
		});

		function write() {
			gapi.client.request({
				path: "https://www.googleapis.com/upload/drive/v3/files/" + encodeURIComponent(drive_file_id),
				method: "PATCH",
				params: {uploadType: "media"},
				body: JSON.stringify(drive)
			})
			.then(rcv, fail);

			function rcv(response) {
			};
		}
	}

	this.revertAppdata = function() {
		angular.copy(drive, appdata);
	}

	function loadDriveFileID(thenDoThis) {
		if (drive_file_id) {
			thenDoThis();
			return;
		}

		gapi.client.request({
			path: "https://www.googleapis.com/drive/v3/files",
			method: "GET",
			params: {q: "name = '" + drive_file_name + "'", spaces: 'appDataFolder'}
		})
		.then(rcv, fail);

		function rcv(response) {
			if (response.result.files.length == 1)
				drive_file_id = response.result.files[0].id;

			thenDoThis();
		}
	}

	function logDriveFileInfo() {
		gapi.client.request({
			path: "https://www.googleapis.com/drive/v3/files",
			method: "GET",
			params: {spaces: 'appDataFolder'}
		})
		.then(rcv, fail);

		function rcv(response) {
			var files = response.result.files;
			console.log(files.length + " files");

			for (var i=0; i < files.length; i++)
				console.log(files[i]);
		}
	}

	var gridview = {};

	var stg = $window.localStorage.getItem("vp-gridviewinfo");
	if (stg)
		gridview = JSON.parse(stg);
	else {
		setViewInfo('column');
		setViewInfo('collapse');
	}
	$rootScope.vp.gridview = gridview;

	function setViewInfo(add, del) {
		if (add)
			gridview[add] = {checked: true};

		if (del)
			delete gridview[del];

		$window.localStorage.setItem("vp-gridviewinfo", JSON.stringify(gridview));
	}

	this.setGridView = function(sel) {
		if (sel.column) setViewInfo('column', 'list');
		if (sel.list) setViewInfo('list', 'column');
		if (sel.expand) setViewInfo('expand', 'collapse');
		if (sel.collapse) setViewInfo('collapse', 'expand');
		if (sel.darktog) {
			if (gridview.darkmode)
				setViewInfo(null, 'darkmode');
			else
				setViewInfo('darkmode');
		}
	}

	function fail(reason) {
		alert(reason.result.error.message);
	}
});



//////////////////////////////////////////////////////////////////////

angular.module("vpApp").service("vpGCal", function(vpConfiguration, $rootScope, $window) {
	var cfg = $rootScope.vp.appdata;
	var isoSpan = {};
	var fAdd = function(){};
	var fRemove = function(){};
	var fUpdate = function(){};
	var reqfailthen = 0;
	var calendarlist = [];

	$rootScope.$on("config:load", function() {
		if ($rootScope.vp.permissions.view_calendars) {
			reqCalendars({});
			loadGCalSettings();
		}
		else
			onload();
	});

	function onload() {
		$rootScope.$apply(function(){
			$rootScope.vp.calendarlist = calendarlist;
		});
	}

	function reqCalendars(reqparams) {
		gapi.client.request({
			path: "https://www.googleapis.com/calendar/v3/users/me/calendarList",
			method: "GET",
			params: reqparams
		})
		.then(rcv, fail);

		function rcv(response) {
			for (item of response.result.items) {
				if (item.selected)
					calendarlist.push(new VpCalendar(item));
			}

			if (response.result.nextPageToken) {
				reqparams.pageToken = response.result.nextPageToken;
				reqCalendars(reqparams);
			}

			onload();
		};
	}

	this.addPublicCalendar = function(id, name, colour, textcolour) {
		var cal = new VpCalendar({
			id: id,
			summary: name,
			backgroundColor: colour,
			foregroundColor: textcolour
		});

		calendarlist.push(cal);
	}

	this.loadPublicCalendarEvents = onload;

	var eventcolours;

	function loadGCalSettings() {
		gapi.client.request({
			path: "https://www.googleapis.com/calendar/v3/users/me/settings/format24HourTime",
			method: "GET",
			params: {}
		})
		.then(rcv, fail);

		gapi.client.request({
			path: "https://www.googleapis.com/calendar/v3/colors",
			method: "GET"
		})
		.then(rcv, fail);

		function rcv(response) {
			if (response.result)
			if (response.result.kind == "calendar#setting")
			if (response.result.id == "format24HourTime")
				VpDateTime.time24h = (response.result.value == "true");

			if (response.result)
			if (response.result.kind == "calendar#colors")
				eventcolours = response.result.event;
		};
	}

	this.register = function(add, remove, update) {
		fAdd = add;
		fRemove = remove;
		fUpdate = update;
	}

	this.setStartDate = function(vdt) {
		isoSpan.start = vdt.dt.toISOString();
	}

	this.setEndDate = function(vdt) {
		isoSpan.end = vdt.dt.toISOString();
	}

	function loadAllCalEvents() {
		fRemove();
		for (cal of calendarlist)
			cal.loadEvents();
	}
	this.loadAllCalEvents = loadAllCalEvents;

	this.syncAllCalEvents = function() {
		for (cal of calendarlist)
			cal.syncEvents();
	}

	function VpCalendar(item) {
		var cal = this;
		var id = item.id;
		var synctok = null;
		var cls = {};
		this.name = item.summary;
		this.colour = {text: item.foregroundColor, background: item.backgroundColor};
		this.cls = cls;
		syncStg(false);

		function reqEvents(reqparams) {
			gapi.client.request({
				path: "https://www.googleapis.com/calendar/v3/calendars/" + encodeURIComponent(id) + "/events",
				method: "GET",
				params: reqparams
			})
			.then(rcv, reqfail);

			function rcv(response) {
				for (item of response.result.items)
					makeEvent(item);

				if (response.result.nextPageToken) {
					reqparams.pageToken = response.result.nextPageToken;
					reqEvents(reqparams);
				}
				else if (response.result.nextSyncToken)
					synctok = response.result.nextSyncToken;
			};

			function makeEvent(item) {
				if (item.kind != "calendar#event")
					return;

				if (item.status == "cancelled") {
					fRemove(item.id);
					return;
				}

				if (item.hasOwnProperty("recurrence"))
					return;

				if (!item.hasOwnProperty("start"))
					return;

				if (reqparams.syncToken)
					fRemove(item.id);

				var evt = new VpEvent(cal, item);

				if (evt.timed) {
					if (cfg.show_timed_events)
						fAdd(evt);
				}
				else {
					if (cfg.show_all_day_events)
						fAdd(evt);
				}
			}

			function reqfail(reason) {
				if ((Date.now() - reqfailthen) < 3000)
					return;

				reqfailthen = Date.now();

				if (reason.status == 401)  // auth expired
					vpConfiguration.Authorise_then(loadAllCalEvents);
				else if (reason.status == 410)  // sync expired
					loadAllCalEvents();
				else
					fail(reason);
			};
		}

		this.loadEvents = function() {
			reqEvents({timeMin: isoSpan.start, timeMax: isoSpan.end, singleEvents: true});
		}

		this.syncEvents = function() {
			reqEvents({syncToken: synctok, singleEvents: true});
		}

		this.toggle = function() {
			cls.checked = cls.checked ? false : true;
			syncStg(true);
			fUpdate();
		}

		function syncStg(write) {
			var tog = JSON.parse($window.localStorage.getItem("vp-caltoginfo"));
			if (!tog)
				tog = {};

			if (write) {
				delete tog[id];
				if (cls.checked)
					tog[id] = true;

				$window.localStorage.setItem("vp-caltoginfo", JSON.stringify(tog));
			}
			else {
				if (tog[id])
					cls.checked = true;
			}
		}
	}

	function VpEvent(cal, item) {
		this.id = item.id;
		this.cal = cal;
		this.location = item.location;
		this.htmlLink = item.htmlLink;
		this.title = cal.name + " | ";

		this.colour = {};
		if (cfg.event_background == "cal")
			this.colour = cal.colour;
		if (cfg.event_background == "white")
			this.colour = {background: "#ffffff"};
		if (cfg.event_background == "evt") {
			this.colour = cal.colour;
			if (item.colorId)
			if (eventcolours && eventcolours[item.colorId])
			if (eventcolours[item.colorId])
				this.colour = {text: eventcolours[item.colorId].foreground, background: eventcolours[item.colorId].background};
		}

		if ("dateTime" in item.start)
		{
			this.timed = true;
			//this.timespan = {start: item.start.dateTime, end: item.end.dateTime};

			var vdttStart = new VpDateTime(item.start.dateTime);
			var vdttEnd = new VpDateTime(item.end.dateTime);

			this.start = vdttStart.ymd();
			this.duration = VpDate.DaySpan(vdttStart.ymd(), vdttEnd.ymd()) + 1;
			this.desc = vdttStart.TimeTitle() + " ";
			this.timestamp = vdttStart.DayMinutes();
		}
		else
		{
			this.timed = false;
			this.start = item.start.date;
			this.duration = VpDate.DaySpan(item.start.date, item.end.date);
			this.desc = "";
			this.timestamp = -1;
		}

		if (item.summary)
			this.desc += item.summary;

		this.title += this.desc;

		if (item.location)
			this.title += "\n" + item.location;

		this.edit = function() {
			$window.open(this.htmlLink.replace("event?eid=", "r/eventedit/"));
		}
	}

	var msg=true;
	function fail(reason) {
		console.error(reason);

		if (msg) {
			alert("Calendar event error.\n\n" + reason.result.error.message);
			msg = false;
		}
	}
});



//////////////////////////////////////////////////////////////////////

angular.module("vpApp").service("vpDiary", function($rootScope, $timeout, vpGCal, $window) {
	var cfg = $rootScope.vp.appdata;
	var view = $rootScope.vp.gridview;
	var vpmonths = [];
	var vpdays = [];
	var ymdFirst;
	vpGCal.register(addEvent, removeEvent, updateEvents);

	this.makePage = function(vdt, pagelength) {
		VpDate.weekends = cfg.weekends.split(',').map(s => parseInt(s));
		VpDate.localemonth = cfg.month_names.split('-');

		vpGCal.setStartDate(vdt);
		ymdFirst = vdt.ymd();

		vpmonths = [];
		vpdays = [];
		var vdtNext = new VpDate(vdt);
		for (var i=0; i < pagelength; i++) {
			var month = new VpMonth(vdtNext);
			month.index = vpmonths.length;
			vpmonths.push(month);
			vdtNext.offsetMonth(1);
			vpGCal.setEndDate(vdtNext);
		}

		vpGCal.loadAllCalEvents();
	}

	this.getPage = function() {
		return vpmonths;
	}

	this.getMonth = function(i) {
		return vpmonths[i];
	}

	this.sync = function() {
		vpGCal.syncAllCalEvents();
	}

	var tmo=null;
	function addEvent(evt) {
		$timeout.cancel(tmo);

		var d = VpDate.DaySpan(ymdFirst, evt.start);
		for (var c=0; c < evt.duration; c++) {
			if (vpdays[d]) {
				var border = {};

				if (c == 0)
					border.first = true;

				if (c == evt.duration - 1)
					border.last = true;

				vpdays[d].addEvent(evt, border);
			}

			d++;
		}

		tmo = $timeout(updateLayout, 1000);
	}

	function removeEvent(id) {
		$timeout.cancel(tmo);

		var month;
		for (month of vpmonths)
			month.removeEvent(id);

		tmo = $timeout(updateLayout, 100);
	}

	function updateEvents() {
		$timeout.cancel(tmo);
		tmo = $timeout(updateLayout, 100);
	}

	function updateLayout() {
		var month;
		for (month of vpmonths)
			month.updateLayout();
	}

	function VpMonth(vdt) {
		this.id = "M-" + vdt.ym();
		this.hdr = vdt.MonthTitle();
		this.gcal = vdt.GCalURL();
		this.year = vdt.dt.getFullYear();
		this.days = [];
		this.dayoffset = 0;
		this.cls = {};

		if (vdt.isPastMonth())
			this.cls.past = true;

		var vdtDay = new VpDate(vdt);
		var m = vdtDay.getMonth();
		while (m == vdtDay.getMonth()) {
			var vpday = new VpDay(this, vdtDay);
			vpday.index = this.days.length;

			if (vpday.index == 0) {
				if (cfg.align_weekends) {
					this.dayoffset = vdtDay.DayOfWeek() - cfg.first_day_of_week;

					if (this.dayoffset < 0)
						this.dayoffset += 7;
				}

				vpday.cls["offset" + this.dayoffset] = true;
			}

			this.days.push(vpday);
			vpdays.push(vpday);

			vdtDay.offsetDay(1);
		}

		if (vdt.isCurrentMonth())
			this.days[new Date().getDate()-1].cls.today = true;

		this.addEvent = function(day, addevt, border) {
			if (!this.labels)
				this.labels = [];

			for (var lab of this.labels) {
				if (lab.evt === addevt) {
					lab.setCellEnd(day.index, border);
					return;
				}
			}

			lab = new VpLabel(addevt);
			lab.setCellStart(this, day.index, border);
			lab.setCellEnd(day.index, border);
			this.labels.push(lab);
		}

		this.removeEvent = function(id) {
			removeEventFromOwner(this, id);

			for (var day of this.days)
				day.removeEvent(id);
		}

		this.updateLayout = function() {
			var slots = [];

			if (this.labels) {
				var lab;
				for (lab of this.labels)
					lab.updateLayout(slots);
			}

			for (var day of this.days)
				day.updateLayout(slots);
		}
	}

	VpMonth.prototype.onclickHdr = function() {
		$window.open("https://www.google.com/calendar/r/month/" + this.gcal);
	}

	function VpDay(vpmonth, vdt) {
		this.num = vdt.DayOfMonth();
		this.datevalue = vdt.dt.valueOf();
		this.month = vpmonth;
		this.cls = {};

		if (vdt.isWeekend())
			this.cls.weekend = true;
	}

	VpDay.prototype.addEvent = function(evt, border) {
		if ((evt.duration > 1) || (cfg.single_day_as_multi_day && !evt.timed)) {
			this.month.addEvent(this, evt, border);
			return;
		}

		if (!this.labels)
			this.labels = [];

		this.labels.push(new VpLabel(evt));
	}

	VpDay.prototype.removeEvent = function(id) {
		removeEventFromOwner(this, id);
	}

	VpDay.prototype.updateLayout = function(slots) {
		this.labelboxstyle = {};

		if (this.labels) {
			var key = Math.pow(2, this.index);

			for (var i = slots.length-1; i>=0; i--) {
				if (key & slots[i]) {
					var slotmargin = ((i + 1) * 1.4) + 0.5;
					this.labelboxstyle[view.column ? "margin-right" : "margin-bottom"] = slotmargin + "em";
					break;
				}
			}

			for (var lab of this.labels)
				lab.updateLayout();
		}
	}

	VpDay.prototype.onclickNum = function(evt) {
		vdt = new VpDate(this.datevalue);
		if (evt.ctrlKey)
			$window.open("https://www.google.com/calendar/r/eventedit?dates=" + vdt.GCalSpanURL(1));
		else
			$window.open("https://www.google.com/calendar/r/day/" + vdt.GCalURL());
	}

	function VpLabel(vpevent) {
		this.evt = vpevent;
		this.cls = {};
		this.style = {};

		var month;
		var day;
		var span;

		var clr = this.evt.colour;
		if (clr.text)
			this.style["color"] = clr.text;
		if (clr.background)
			this.style["background-color"] = clr.background;

		this.setCellStart = function(vpmonth, iday, border) {
			month = vpmonth;
			day = iday;
			span = 1;

			this.multiboxstyle = {};

			if (border.first)
				this.cls.borderfirst = true;
		}

		this.setCellEnd = function(iday, border) {
			span = (iday - day) + 1;

			if (border.last)
				this.cls.borderlast = true;
		}

		this.updateLayout = function(slots) {
			this.style.display = "none";

			if (this.multiboxstyle)
				this.multiboxstyle.display = "none";

			if (this.evt.cal.cls.checked)
				return;

			delete this.style.display;

			if (this.multiboxstyle) {
				var slot = getSlot(slots);

				delete this.multiboxstyle.display;
				this.style[view.column ? "right" : "bottom"] = 0.5 + (1.4*slot) + "em";
				this.multiboxstyle[view.column ? "grid-column" : "grid-row"] = month.id + " / span 1";
				this.multiboxstyle[view.column ? "grid-row" : "grid-column"] = month.dayoffset + day + 2 + " / span " + span;
			}
		}

		function getSlot(slots) {
			var key = (Math.pow(2, span) - 1) << day;

			var i;
			for (i=0; i < slots.length; i++) {
				if (key & slots[i])
					continue;

				slots[i] |= key;
				return i;
			}

			slots.push(key);
			return i;
		}
	}

	function removeEventFromOwner(owner, id) {
		if (owner.labels) {
			if (id)
				for (var i=0; i < owner.labels.length; i++) {
					if (owner.labels[i].evt.id == id) {
						owner.labels.splice(i, 1);
						return;
					}
				}
			else
				delete owner.labels;
		}
	}
});



//////////////////////////////////////////////////////////////////////

angular.module("vpApp").directive("vpGrid", function(vpConfiguration, vpDiary, $window, $timeout, $location, $sce) {
	function fCtl($scope) {
		var cfg = $scope.vp.appdata;
		var view = $scope.vp.gridview;

		var box = document.getElementById("vpbox");
		var scrollbox = document.getElementById("vpscrollbox");
		var vdt;
		var buffer;
		var pagelength;
		var vislength;

		hideGrid(true);

		$scope.$watch("vp.calendarlist", function() {
			if ($scope.vp.calendarlist)
				start();
		});

		function start() {
			buffer = cfg.scroll_buffer;
			vislength = cfg.month_count;
			pagelength = buffer + vislength + buffer;

			$scope.vpgrid.fontscale = cfg.font_scale_pc/100;
			$scope.vpgrid.past_opacity = cfg.past_opacity;
			$scope.vpgrid.scroll_size = (pagelength / vislength)*100;
			$scope.vpgrid.scroll_size_portrait = $scope.vpgrid.scroll_size*2;
			$scope.vpgrid.multi_day_opacity = cfg.multi_day_opacity;
			$scope.vpgrid.singledaytext = cfg.text_on_singleday_events;
			$scope.vpgrid.multidaytext = cfg.text_on_multiday_events;
			$scope.vpgrid.multidayscale = cfg.scale_of_multiday_events/100;
			$scope.vpgrid.cls = cfg.same_row_height ? {} : {flexrow: true};
			$scope.vpgrid.sbox_cls = cfg.hide_scrollbars ? {hidescroll: true} : {};

			initDate();
			loadPage();
		}

		function initDate() {
			vdt = new VpDateMonth;

			if (cfg.auto_scroll) {
				vdt.offsetMonth(cfg.auto_scroll_offset);
			}
			else {
				var off = ((cfg.first_month-1) - new Date().getMonth());
				if (off > 0) off -= 12;
				vdt.offsetMonth(off);
			}
		}

		function loadPage() {
			var vdtPage = new VpDate(vdt);
			vdtPage.offsetMonth(-buffer);

			vpDiary.makePage(vdtPage, pagelength);
			$scope.vpgrid.page = vpDiary.getPage();
			$scope.vpgrid.gridareas = getGridAreas($scope.vpgrid.page);
			$scope.vpgrid.year = vdt.dt.getFullYear();

			$timeout(function() {
				var monthdivs = box.querySelectorAll(".vpmonth");

				if (view.column)
					scrollbox.scrollTo(monthdivs[buffer].firstElementChild.offsetLeft, 0);

				if (view.list)
					scrollbox.scrollTo(0, monthdivs[buffer].firstElementChild.offsetTop);

				showGrid();
			});
		}

		function hideGrid(hide_all) {
			if (hide_all)
				box.style.visibility = "hidden";

			scrollbox.style.visibility = "hidden";
		}

		function showGrid() {
			box.style.visibility = "";
			scrollbox.style.visibility = "";

			box.focus();
		}

		function getGridAreas(page) {
			var gridareas = "";

			for (month of page) {
				if (view.column)
					gridareas += (month.id + ' ');
				if (view.list)
					gridareas += ('"' + month.id + '" ');
			}

			if (view.column)
				return '"' + gridareas + '"';

			return gridareas;
		}

		function getVisInfo() {
			var info = {months: [], index: null};
			var scrollpos = view.column ? scrollbox.scrollLeft : scrollbox.scrollTop;

			var monthdivs = scrollbox.querySelectorAll(".vpmonth");
			for (var i=0; i < monthdivs.length; i++) {
				var hdr = monthdivs[i].firstElementChild;
				var monthpos = view.column ? hdr.offsetLeft : hdr.offsetTop;
				var monthsize = view.column ? hdr.offsetWidth : hdr.offsetHeight;

				if (monthpos + (monthsize / 2) > scrollpos)
					info.months.push(vpDiary.getPage()[i]);

				if (info.months.length == 1)
					info.index = i;

				if (info.months.length == vislength)
					break;
			}

			return info;
		}

		this.reset = function() {
			start();
		}

		this.onclickColumn = function() {
			if (view.column)
				return;

			hideGrid();
			$timeout(function() {
				vpConfiguration.setGridView({column: true});

				initDate();
				loadPage();
			});
		}

		this.onclickList = function() {
			if (view.list)
				return;

			hideGrid();
			$timeout(function() {
				vpConfiguration.setGridView({list: true});

				initDate();
				loadPage();
			});
		}

		this.onclickExpand = function() {
			if (view.expand)
				vpConfiguration.setGridView({collapse: true});
			else
				vpConfiguration.setGridView({expand: true});

			box.focus();
		}

		this.onclickDarkMode = function() {
			vpConfiguration.setGridView({darktog: true});
			box.focus();
		}

		this.onclickSync = function() {
			vpDiary.sync();
			box.focus();
		}

		this.onclickContinue = function() {
			hideGrid();
			$timeout(function() {
				var visinfo = getVisInfo();
				vdt.offsetMonth(visinfo.index - buffer);
				loadPage();
			});
		}

		this.onclickPrint = function() {
			var visinfo = getVisInfo();

			$window.vpprint = {gridoptions: {}, gridview: {}, calendarlist: [], grid: {}};
			angular.copy($scope.vp.gridoptions, $window.vpprint.gridoptions);
			angular.copy($scope.vp.gridview, $window.vpprint.gridview);
			angular.copy($scope.vp.calendarlist, $window.vpprint.calendarlist);
			angular.copy($scope.vpgrid, $window.vpprint.grid);

			$window.vpprint.grid.page = visinfo.months;
			$window.vpprint.grid.gridareas = getGridAreas(visinfo.months);

			$window.open("vpprint.htm");
		}

		this.onclickNavbar = function(evt) {
			var navdiv = document.getElementById("vpnavbar");
			var day_px = navdiv.offsetWidth / (365 * 5.5);
			var year_pt = navdiv.offsetWidth / 2;
			var click_off = evt.clientX - year_pt;
			var day_off = Math.round(click_off / day_px);
			var click_month = new Date($scope.vpgrid.year, 6, day_off);

			hideGrid();
			$timeout(function() {
				vdt = new VpDateMonth(click_month.getFullYear(), click_month.getMonth()+1);
				loadPage();
			});
		}

		this.onkeydown = function(evt) {
			if (!evt.ctrlKey || evt.shiftKey || evt.altKey || evt.metaKey)
				return;

			switch (evt.key)
			{
				case "Enter":
					this.onclickContinue();
					break;
				default:
					return;
			}

			evt.preventDefault();
		}

		scrollbox.onwheel = function(evt) {
			if (evt.ctrlKey || evt.shiftKey || evt.altKey || evt.metaKey)
				return;

			if (cfg.hide_scrollbars) {
				if (view.column) {
					var colwidth = (scrollbox.offsetWidth / cfg.month_count);
					scrollbox.scrollBy(evt.deltaY > 0 ? colwidth : -colwidth, 0);
				}

				if (view.list) {
					var colheight = (scrollbox.offsetHeight / cfg.month_count);
					scrollbox.scrollBy(0, evt.deltaY > 0 ? colheight : -colheight);
				}

				evt.preventDefault = true;
				return false;
			}
		}
	}

	function fLink(scope, element, attrs) {
		//if (!attrs.hasOwnProperty("disableAutoload"))
			//scope.vpgrid.init();
	}

	var url = "https://visual-planner.github.io/vpgrid.htm";
	if ($location.$$host == "localhost" && $location.$$port == 8080)
		url = "http://localhost:8080/visual-planner.github.io/vpgrid.htm";

	return {
		controller: fCtl,
		controllerAs: "vpgrid",
		link: fLink,
		templateUrl: $sce.trustAsResourceUrl(url),
		//replace: true,
		restrict: 'E'
	};
});



//////////////////////////////////////////////////////////////////////

function VpDate(src_date) {
	if (src_date instanceof VpDate) {
		this.dt = new Date(src_date.dt);
	}
	else if (src_date) {
		this.dt = new Date(src_date);
	}
	else {
		var today = new Date;
		this.dt = new Date(today.getFullYear(), today.getMonth(), today.getDate());
	}
}

VpDate.prototype.ym = function() {
	return this.dt.getFullYear() + VpDate.ymdstr[this.dt.getMonth()];
}

VpDate.prototype.ymd = function() {
	return this.ym() + VpDate.ymdstr[this.dt.getDate()-1];
}

VpDate.prototype.ymdnum = function() {
	return this.ymd().replace(/-/g, '');
}

VpDate.prototype.getMonth = function() {
	return this.dt.getMonth()+1;
}

VpDate.prototype.offsetDay = function(off) {
	this.dt.setDate(this.dt.getDate() + off);
}

VpDate.prototype.offsetMonth = function(off) {
	this.dt.setMonth(this.dt.getMonth() + off);
}

VpDate.prototype.toStartOfWeek = function(startday) {
	while (this.dt.getDay() != startday)
		this.dt.setDate(this.dt.getDate() - 1);
}

VpDate.prototype.toStartOfMonth = function() {
	this.dt.setDate(1);
}

VpDate.prototype.toStartOfYear = function() {
	this.dt.setMonth(0);
	this.dt.setDate(1);
}

VpDate.prototype.DayOfMonth = function() {
	return this.dt.getDate();
}

VpDate.prototype.DayOfWeek = function() {
	return this.dt.getDay();
}

VpDate.prototype.isWeekend = function() {
	return (VpDate.weekends.includes(this.dt.getDay()));
}

VpDate.prototype.isPastMonth = function() {
	var today = new Date;

	if (this.dt.getYear() < today.getYear())
		return true;

	if (this.dt.getYear() > today.getYear())
		return false;

	return (this.dt.getMonth() < today.getMonth());
}

VpDate.prototype.isCurrentMonth = function() {
	var today = new Date;
	return (this.dt.getFullYear() == today.getFullYear() && this.dt.getMonth() == today.getMonth());
}

VpDate.prototype.MonthTitle = function() {
	return fmt("^ ^", VpDate.localemonth[this.dt.getMonth()], this.dt.getFullYear());
}

VpDate.prototype.GCalURL = function() {
	return fmt("^/^/^", this.dt.getFullYear(), this.dt.getMonth()+1, this.dt.getDate());
}

VpDate.prototype.GCalSpanURL = function(daycount) {
	var vdtEnd = new VpDate(this);
	vdtEnd.offsetDay(daycount);
	return fmt("^/^", this.ymdnum(), vdtEnd.ymdnum());
}

VpDate.ymdstr = ["-01", "-02", "-03", "-04", "-05", "-06", "-07", "-08", "-09", "-10",
	"-11", "-12", "-13", "-14", "-15", "-16", "-17", "-18", "-19", "-20",
	"-21", "-22", "-23", "-24", "-25", "-26", "-27", "-28", "-29", "-30", "-31"];

VpDate.weekends = [0, 6];
VpDate.localemonth = [];

/*
VpDate.fromYMD = function(ymd) {
	vdt = new VpDate;
	vdt.dt = new Date(parseInt(ymd.substr(0,4)), parseInt(ymd.substr(5,2))-1, parseInt(ymd.substr(8,2)));  // local
	//vdt.dt = new Date(ymd);  // iso
	return vdt;
}
*/

VpDate.DaySpan = function(ymd1, ymd2) {
	return (Date.parse(ymd2) - Date.parse(ymd1))/86400000;
}




/////////////////////////////////////////////////////////////////

function VpDateMonth(yyyy, mm) {
	if (yyyy && mm) {
		this.dt = new Date(yyyy, mm-1);
	}
	else {
		var today = new Date;
		this.dt = new Date(today.getFullYear(), today.getMonth());
	}
}

VpDateMonth.prototype = new VpDate;




/////////////////////////////////////////////////////////////////

function VpDateTime(iso) {
	this.dt = new Date(iso);
}

VpDateTime.prototype = new VpDate;

VpDateTime.prototype.DayMinutes = function() {
	return ((this.dt.getHours()*60) + this.dt.getMinutes());
}

VpDateTime.prototype.TimeTitle = function() {
	var hh = this.dt.getHours();
	var mm = this.dt.getMinutes();
	var ss = this.dt.getSeconds();

	var minutes = fmt((mm < 10) ? "0^" : "^", mm);

	if (VpDateTime.time24h) 	{
		return fmt("^:^", hh, minutes);
	}
	else {
		var hours = (hh > 12) ? (hh-12) : hh;
		return fmt((hh < 12) ? "^:^am" : "^:^pm", hours, minutes);
	}
}

VpDateTime.time24h = true;



/////////////////////////////////////////////////////////////////

function fmt(fmtspec) {
	var str = "";
	var arg=1;
	for (var i in fmtspec) {
		if (fmtspec[i] == '^') {
			if (arg < arguments.length) {
				str += arguments[arg];
				arg++;
			}
		}
		else {
			str += fmtspec[i];
		}
	}

	return str;
}
