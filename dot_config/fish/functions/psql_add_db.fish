function psql_add_db --description "creates new DB on existing instance with new user"
	argparse --name='psql_add_db' 'help' "h/host=" "p/port=" "U/username=" "W/password=" "u/existing-user=" "P/existing-password" -- $argv
	or return

	if set --query _flag_help
		printf "usage psql_add_db NAME [OPTIONS]\n\n"
		printf "After running the command, you will be prompted to provide credentials\n"
		printf "for existing user that has permissions to create new database and user\n\n"
		printf "Options:\n"
		printf "  --help  prints help and exists\n"
		printf "  -h/--host              hostname where PSQL instance is, default 'localhost'\n"
		printf "  -p/--port              port where PSQL listening on, default '5432'\n"
		printf "  -U/--username          username to create, default the same as database name\n"
		printf "  -W/--password          password to set for user, default 'secret'\n"
		printf "  -u/--existing-user     userame for user that already exists and has permissions to create DB, default 'postgres'"
		printf "  -P/--existing-password passwor for user that already exists and has permissions to create DB, default 'password'"
		return 0
	end

	# initialize default parameter values
	set --local _remaining_args (count $argv)
	if [ (count $argv) -ne "1" ]
		printf "unknown options: $argv"
		return 1
	end
	set --local _db_name $argv[1]
	
	# initialize default parameter values
	set --query _flag_host; or set --local _flag_host "localhost"
	set --query _flag_port; or set --local _flag_port 5432
	set --query _flag_username; or set --local _flag_username $_db_name
	set --query _flag_password; or set --local _flag_password 'secret'
	set --query _flag_existing_user; or set --local _flag_existing_user 'postgres'
	set --query _flag_existing_password; or set --local _flag_existing_password 'password'

	# check if psql command is available
	if not command -sq psql
		printf "psql command not found"
		return 1
	end

	printf "\set AUTOCOMMIT on\n create database $_db_name; \n create user $_flag_username with encrypted password '$_flag_password'; \n grant all privileges on database $_db_name to $_flag_username;" | PGPASSWORD=$_flag_existing_password psql -h $_flag_host -U $_flag_existing_user
end