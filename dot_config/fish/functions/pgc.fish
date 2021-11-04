function pgc --description "connect to psql database via pgcli and autopopulate credentials"
	argparse --name='pgc' 'help' -- $argv
	or return

	if set --query _flag_help
		printf "Usage: pgc <environment> <name> OR pgc <environment> OR pgc\n\n"
		printf "If name is not provided, environment variable PROJECT_NAME will be used\n"
		printf "If environment is not provided, 'local' environment will be used with hardocded values\n\n"
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

	# parse positional arugments
	if [ (count $argv) -eq 0 ]
		# no arguments, use default values
		set _name $PROJECT_NAME
		set _env "local"
	else if [ (count $argv) -eq 1 ]
		# just one argument, treat it as env
		set _name $PROJECT_NAME
		set _env $argv[1]
	else if [ (count $argv) -eq 2 ]
		# both arguments, treat first one as env, second one as name
		set _env $argv[1]
		set _name $argv[2]
	else
		set_color red;
		echo "unexpected number of arguments:" (count $argv)
		set_color normal;
		return 1
	end

	# check we have all set
	set_color red;
	if test -z "$_name"; echo "namenot found"; and return 1; end
	if test -z "$_env"; echo "environment not found"; and return 1; end
	set_color normal;

	# if local environment, use hardcoded values (compatible with other psql functions)
	if [ $_env = "local" ]
		set _host "localhost"
		set _username "postgres"
		set _password "password"
		set _database $_name
	else
		# otherwise fetch all information from 1password
		set --local _op_item_name "psql-$_name-$_env"
		set --local _db_secrets (op get item $_op_item_name --fields host,username,password,database) 
		if test $status != 0
			printf "lookup for item $_op_item_name op failed\n\n"
			printf "Make sure item $_op_item_name exists.\n"
			printf "Make sure you are logged in this shell 'eval (op signin my)'"
			return 1
		end
		set _host (echo $_db_secrets | jq -j '.host')
		set _username (echo $_db_secrets | jq -j '.username')
		set _password (echo $_db_secrets | jq -j '.password')
		set _database (echo $_db_secrets | jq -j '.database')
		
		set_color red;
		if test -z "$_host"; echo "host not found"; and return 1; end
		if test -z "$_username"; echo "username not found"; and return 1; end
		if test -z "$_password"; echo "password not found"; and return 1; end
		if test -z "$_database"; echo "database not found"; and return 1; end
		set_color normal;
	end

	set --local _cmd (__find_psql_command)
	set_color red
	if [ $_cmd = "" ]; echo "pgcli or psql commands not found"; and return 1; end
	set_color normal

	set_color green
	echo "connecting, using $_cmd"
	set_color normal

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