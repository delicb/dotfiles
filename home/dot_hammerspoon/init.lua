hs.loadSpoon("ReloadConfiguration")
spoon.ReloadConfiguration:start()


function dump(o)
	if type(o) == 'table' then
	   local s = '{ '
	   for k,v in pairs(o) do
		  if type(k) ~= 'number' then k = '"'..k..'"' end
		  s = s .. '['..k..'] = ' .. dump(v) .. ','
	   end
	   return s .. '} '
	else
	   return tostring(o)
	end
 end


mouseCircle = nil
mouseCircleTimer = nil

function mouseHighlight()
	print("in mouseHightlight")
	-- Delete an existing highlight if it exists
	if mouseCircle then
		mouseCircle:delete()
		if mouseCircleTimer then
			mouseCircleTimer:stop()
		end
	end
	-- get the current coordinates of the mouse pointer
	mousepoint = hs.mouse.absolutePosition()
	-- prepare a big red circle around the mouse pointer
	mouseCircle = hs.drawing.circle(hs.geometry.rect(mousepoint.x-40, mousepoint.y-40, 80, 80))
	mouseCircle:setStrokeColor({["red"]=1, ["blue"]=0, ["green"]=0, ["alpha"]=1})
	mouseCircle:setFill(false)
	mouseCircle:setStrokeWidth(5)
	mouseCircle:show()

	-- set timer to delete the circle after 3 seconds
	mouseCircleTimer = hs.timer.doAfter(3, function()
		mouseCircle:delete()
		mouseCircle = nil
	end)
end
hs.hotkey.bind({"cmd", "alt", "shift"}, "D", mouseHighlight)

local ghosttyBundleID = "com.mitchellh.ghostty"
local pendingGhosttyTimer

local function placeGhostty(win, screen)
	local frame = win:frame()
	local display = screen:frame()

	frame.w = math.min(frame.w, display.w)
	frame.h = display.h
	frame.x = display.x + display.w - frame.w
	frame.y = display.y

	win:setFrame(frame, 0.4)
	win:focus()
end

hs.hotkey.bind({"alt"}, "`", function()
	if pendingGhosttyTimer then
		pendingGhosttyTimer:stop()
		pendingGhosttyTimer = nil
		local app = hs.application.get(ghosttyBundleID)
		if app then app:hide() end
		return
	end

	local app = hs.application.get(ghosttyBundleID)
	if app and app:isFrontmost() then
		app:hide()
		return
	end

	local screen = hs.screen.primaryScreen()
	if not screen then return end

	if not hs.application.launchOrFocusByBundleID(ghosttyBundleID) then
		hs.alert.show("Could not open Ghostty")
		return
	end

	local function placeWhenReady()
		local runningApp = hs.application.get(ghosttyBundleID)
		local win = runningApp and
			(runningApp:mainWindow() or runningApp:focusedWindow())
		if not win then return false end

		placeGhostty(win, screen)
		return true
	end

	if placeWhenReady() then return end

	local attempts = 0
	pendingGhosttyTimer = hs.timer.doEvery(0.1, function()
		attempts = attempts + 1
		local placed = placeWhenReady()
		if placed or attempts >= 50 then
			pendingGhosttyTimer:stop()
			pendingGhosttyTimer = nil
			if not placed then
				hs.alert.show("Ghostty did not open a window")
			end
		end
	end)
end)

-- utility function to check if a string starts with another string
string.startswith = function(self, str) 
    return self:find('^' .. str) ~= nil
end


hs.grid.setGrid('12x12') -- allows us to place on quarters, thirds and halves
