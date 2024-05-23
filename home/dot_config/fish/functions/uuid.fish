function uuid --description "generate and print UUID4, uses python"
	echo (python -c "import uuid; print(uuid.uuid4())")
end
