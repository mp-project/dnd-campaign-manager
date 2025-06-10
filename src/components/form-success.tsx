import { CheckCircledIcon } from "@radix-ui/react-icons"

interface FormSuccessProps {
  message?: string;
}

export const FormSuccess = ({ message }: FormSuccessProps) => {
  if(!message) return null;
  return (
    <div className="flex items-center gap-x-2 text-emerald-500 bg-emerald-500 p-3 rounded-md">
      <CheckCircledIcon className="w-4 h-4" />
      <span className=" text-white text-center ">{message}</span>
    </div>
  );
}