function cpwd -d 'Copy the current directory path to the clipboard'
	set_clipboard (pwd | tr -d "\n")
end
