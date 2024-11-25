hs.loadSpoon("ReloadConfiguration")
spoon.ReloadConfiguration:start()


-- caffeine = hs.menubar.new()
-- function setCaffeineDisplay(state)
-- 	if state then
-- 		caffeine:setTitle("AWAKE")
-- 	else
-- 		caffeine:setTitle("SLEEPY")
-- 	end
-- end

-- function caffeineClicked()
-- 	setCaffeineDisplay(hs.caffeinate.toggle("displayIdle"))
-- end

-- if caffeine then
-- 	caffeine:setClickCallback(caffeineClicked)
-- 	setCaffeineDisplay(hs.caffeinate.get("displayIdle"))
-- end

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

-- hs.fnutils.each(hs.application.runningApplications(), function(app) print(app:title()) end)

-- hs.application.enableSpotlightForNameSearches(true)

-- drop-down quake-style terminal

hs.hotkey.bind({"alt"}, "`", function()
	-- local APP_NAME = "kitty"
	-- local APP_BUNDLE = "net.kovidgoyal.kitty"
	local APP_NAME = "ghostty"
	local APP_BUNDLE = "com.mitchellh.ghostty"

	function moveWindow(terminal)
		-- screen to move termonal to, always main one
		local screen = hs.screen.find({x=0, y=0})

		local win = nil
		while win == nil do
			win = terminal:mainWindow()
		end
		winFrame = win:frame()
		
		scrFrame = screen:frame()
		local width = math.max(scrFrame.w / 2, 2000)
		width = math.min(scrFrame.w, width)  -- maximum screen size
		winFrame.w = width
		winFrame.h = scrFrame.h
		winFrame.x = scrFrame.w - width
		winFrame.y = scrFrame.y
		win:setFrame(winFrame, 0.4)
		hs.spaces.moveWindowToSpace(win, hs.spaces.activeSpaceOnScreen(screen))
		win:focus()
	end

	local terminal = hs.application.get(APP_BUNDLE)

	if terminal ~= nil and terminal:isFrontmost() then
		terminal:hide()
	else
		local space = hs.spaces.activeSpaceOnScreen()
		print("activeSpace() = ", space)
		if terminal == nil and hs.application.launchOrFocusByBundleID(APP_BUNDLE) then
			local appWatcher = nil
			print("create app watcher")
			appWatcher = hs.application.watcher.new(function(name, event, app)
				print(name)
				print(event)
				if event == hs.application.watcher.launched and name == APP_NAME then
					app:hide()
					moveWindow(app)
					appWatcher:stop()
				end
			end)
			print('start watcher')
			appWatcher:start()
		end
		if terminal ~= nil then
			print("moving window: ", APP_NAME, " = ", terminal, "space = ", space)
			moveWindow(terminal)
		end
	end
end)

-- utility function to check if a string starts with another string
string.startswith = function(self, str) 
    return self:find('^' .. str) ~= nil
end

-- temporary, this support bouncing focus between jetbrains product (pycharm, goland)
-- and ghostty terminal. Assumption is that jetbrains product is on the left and ghostty is
-- on the right. This is how I use it.
-- this should be merged with alt+` above, and detect situations when to do bounce and when to
-- just open the ghosty (e.g. when no ghosty and jebrains product can be found in the same screen)
-- also - it would be great to automate creating this layout, but support for full screen 
-- (which is what I am using) is not ideal. 
hs.hotkey.bind({"alt"}, "1", function()
	local GHOSTTY_BUNDLE = "com.mitchellh.ghostty"
	local JETBRAINS_BUNDLE = "com.jetbrains."

	-- local terminal = hs.application.get("com.mitchellh.ghostty")
	local frontmost = hs.window.focusedWindow()
	local frontmost_bundle = frontmost:application():bundleID()
	if frontmost_bundle == GHOSTTY_BUNDLE then
		print("switching focus to window to the left")
		frontmost.focusWindowWest()
	end
	if frontmost_bundle:startswith(JETBRAINS_BUNDLE) then
		print("switching focus to window to the right")
		frontmost.focusWindowEast()
	end
end)

hs.grid.setGrid('12x12') -- allows us to place on quarters, thirds and halves
