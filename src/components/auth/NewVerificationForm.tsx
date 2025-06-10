"use client";
import { useCallback , useEffect, useState} from "react";
import { CardWrapper } from "@/components/auth/card-wrapper";
import { BeatLoader } from "react-spinners";
import { useSearchParams } from "next/navigation";
import { newVerification } from "@/actions/new-verification";
import { FormError } from "@/components/form-error";
import { FormSuccess } from "@/components/form-success";


export const NewVerificationForm = () => {
  const searchParams = useSearchParams();

  const token = searchParams.get("token");
  const [error, setError] = useState<string | undefined>();
  const [success , setSuccess] = useState<string | undefined>()

  const onSubmit = useCallback(async () => {
    if(!token) {
      setError("Token not found");
      return;
    }
    newVerification(token).then((data) => {
      console.log(data);
      setSuccess(data.success);
      setError(data.error);
    }).catch((error) => {
      setError("An error occurred");
    });
  }, [token]);

  useEffect(() => {
    onSubmit();
  }, [onSubmit]);

  return (
    <CardWrapper
    headerLabel="Confirm your email address"
    backButtonLabel="Back to login"
    backButtonHref="/auth/login">
      <div className="flex items-center w-full justify-center flex-col gap-5">
        {!success && !error && (
          <BeatLoader color="#2563EB" />
        )}
        <FormError message={error} />
        <FormSuccess message={success} />
      </div>
    </CardWrapper>
  );
}