function pgc --description "connect to psql database via pgcli and autopopulate credentials"
	argparse --name='pgc' 'help' -- $argv
	or return

	if set --query _flag_help
		printf "Usage: pgc <name> <environment>\n\n"
		printf "Connects to the database using pgcli or psql and credentials from 1Passowrd\n\n"
		printf "Prerequisites: \n"
		printf "  pgcli or psql installed\n"
		printf "  op installed (1Password CLI)\n"
		printf "  op signed in (execute 'eval (op signin my)')\n\n"
		printf "Two arguments are required - name of application and environment.\n"
		printf "They will be used to query 1Password (using op command) and name of\n"
		printf "item that will be looked up is 'psql-<name>-<environment>\n"
		printf "Item under this name in 1Passowrd must have fields\n"
		printf "'host', 'username', 'password', and 'database'\n\n"
		printf "After that pgcli command is executed to automatically connect\n"
		printf "to the database."

		return 0
	end

	if [ (count $argv) -lt  1 ]
		set_color red;
		echo "at least name is requried as an argument"
		set_color normal;
		return 1
	end

	set --local _name $argv[1]
	if [ (count $argv) -gt "1" ]
		set _env $argv[2]
	else
		echo "env not provided, using staging"
		set _env "staging"
	end

	set --local _op_item_name "psql-$_name-$_env"
	set --local _db_secrets (op get item $_op_item_name --fields host,username,password,database) 
	if test $status != 0
		printf "lookup for item $_op_item_name op failed\n\n"
		printf "Make sure item $_op_item_name exists.\n"
		printf "Make sure you are logged in this shell 'eval (op signin my)'"
		return 1
	end
	set --local _host (echo $_db_secrets | jq -j '.host')
	set --local _username (echo $_db_secrets | jq -j '.username')
	set --local _password (echo $_db_secrets | jq -j '.password')
	set --local _database (echo $_db_secrets | jq -j '.database')
	
	test -n "$_host"; or echo "host not found"
	test -n "$_username"; or echo "username not found"
	test -n "$_password"; or echo "password not found"
	test -n "$_database"; or echo "database name not found"

	set --local _cmd (__find_psql_command)
	if [ $_cmd = "" ]
		echo "pgcli or psql commands not found"
		return 1
	end

	set_color green;
	echo "connecting, using $_cmd"
	set_color normal;

	PGPASSWORD=$_password $_cmd -h $_host -p 5432 -U $_username -d $_database
end

function __find_psql_command
	if command -q pgcli
		echo (command -s pgcli)
		return
	end
	if command -q psql
		echo (command -s psql)
		return
	end
end