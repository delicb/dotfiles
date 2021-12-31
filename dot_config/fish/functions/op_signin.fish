function op_signin --description "wrapper for 1password CLI login"
	if test (count $argv) = 0
		set account "my"
	else
		set account $argv[1]
	end
	
	# signin only if current session does not exist or is expired

	# check if session file exists or is empty
	if not test -f $HOME/.op_session || test -z (cat $HOME/.op_session)
		__op_signin $account
		return
	end

	# session expires in 30 minutes, so we check for a minute less
	set -l _expiration_duration (math "29 * 60")
	set -l _expires_at (math (stat -f %m $HOME/.op_session) + $_expiration_duration)
	if test $_expires_at -lt (date +%s)
		__op_signin $account
	end
end

function __op_signin
	echo (command op signin $argv[1] --raw) > $HOME/.op_session
	chmod 600 $HOME/.op_session  # always ensure strict permissions on this file
end