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

-- show terminal on current desktop, open it if needed
-- tp make this work, workaround is needed - open Ghostty and do right click on in in Dock,
--   select Options -> Assign to All Desktops. This is needed because Apple made private API
--   that was needed for activeSpaceOnScreen function since MacOS Sequoia
hs.hotkey.bind({"alt"}, "`", function()
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


hs.grid.setGrid('12x12') -- allows us to place on quarters, thirds and halves
