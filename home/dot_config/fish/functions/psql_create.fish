function psql_create --description "create and start new PSQL DB using docker container"
	argparse --name='psql_create' 'h/help' 'b/bind=' 'u/username=' 'p/password=' 'n/name=' 'i/image=' -- $argv
	or return

	if set --query _flag_help
		printf "usage psql_create [OPTIONS]\n\n"
		printf "Options:\n"
		printf "  -h/--help      prints help and exits\n"
		printf "  -b/--bind      address and port to bind on, default 5432\n"
		printf "  -n/--name      name of docker container to use, default auto-generated\n"
		printf "  -u/--username  username of postgress root user, default 'postgres'\n"
		printf "  -p/--password  password of porstgress root user, default 'password'\n"
		printf "  -i/--image     postgres image to use, default 'postgres:12.5-alpine'\n"
		return 0
	end

	# initialize default parameter values
	set --query _flag_bind; or set --local _flag_bind 5432
	set --query _flag_username; or set --local _flag_username 'postgres'
	set --query _flag_password; or set --local _flag_password 'password'
	set --query _flag_image; or set --local _flag_image 'postgres:12.7-alpine'
	if set --query _flag_name
		set _name_param "--name=$_flag_name"
	end

	# check if docker command is available
	if not command -sq docker
		printf "docker must be available to create new containers"
		return 1
	end

	set --local container_id (docker run -d  \
		--tmpfs=/data \
		--rm \
		-e POSTGRES_USER=$_flag_username \
		-e POSTGRES_PASSWORD=$_flag_password \
		-e PGDATA=/data \
		$_name_param \
		-p $_flag_bind:5432 \
		$_flag_image
	)
	
	set --local container_name (docker ps --filter "id=$container_id" --format '{{ .Names }}')

	printf "ID: $container_id\n"
	printf "Name: $container_name\n"
end